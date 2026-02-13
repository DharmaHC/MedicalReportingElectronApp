/**
 * whisperService.ts
 * Servizio per speech-to-text locale usando whisper.cpp standalone binary.
 * L'audio non lascia mai il client (privacy GDPR per dati sanitari).
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import https from 'https';
import http from 'http';
import log from 'electron-log';

// --------------- Costanti ---------------

const WHISPER_DIR_NAME = 'whisper';

// URL download modelli da Hugging Face (pubblici, no auth)
const MODEL_URLS: Record<string, string> = {
  'ggml-tiny.bin': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  'ggml-base.bin': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  'ggml-small.bin': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  'ggml-medium.bin': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
};

// Dimensioni approssimative per calcolo progresso
const MODEL_SIZES: Record<string, number> = {
  'ggml-tiny.bin': 75_000_000,
  'ggml-base.bin': 142_000_000,
  'ggml-small.bin': 466_000_000,
  'ggml-medium.bin': 1_500_000_000,
};

// URL download binary whisper da GitHub releases (CPU-only, Windows x64)
// v1.8.3: whisper-bin-x64.zip (~4 MB) contiene whisper-cli.exe
const WHISPER_BINARY_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-bin-x64.zip';
const WHISPER_BINARY_FILENAME = 'whisper-cli.exe';

// --------------- Interfacce ---------------

export interface SpeechToTextConfig {
  enabled: boolean;
  model: string;
  language: string;
}

export interface WhisperStatus {
  enabled: boolean;
  binaryAvailable: boolean;
  modelDownloaded: boolean;
  modelName: string;
  language: string;
  error?: string;
}

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  error?: string;
  durationMs?: number;
}

export interface DownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
}

// --------------- Path helpers ---------------

/**
 * Cartella per modelli e dati whisper in userData
 * (persistente tra aggiornamenti app)
 */
export function getWhisperDir(): string {
  const dir = path.join(app.getPath('userData'), WHISPER_DIR_NAME);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Path del binary whisper-cli.exe
 * Cerca in ordine:
 * 1. userData/whisper/ (scaricato on-demand)
 * 2. resources/whisper/ (bundled con l'app, produzione)
 * 3. whisper-bin/ (sviluppo locale)
 */
export function getWhisperBinaryPath(): string {
  // 1. Scaricato on-demand in userData
  const userDataPath = path.join(getWhisperDir(), WHISPER_BINARY_FILENAME);
  if (fs.existsSync(userDataPath)) {
    return userDataPath;
  }

  // 2. Bundled con l'app (produzione)
  if (app.isPackaged) {
    const resourcePath = path.join(process.resourcesPath, 'whisper', WHISPER_BINARY_FILENAME);
    if (fs.existsSync(resourcePath)) {
      return resourcePath;
    }
  }

  // 3. Dev locale
  const devPath = path.join(process.cwd(), 'whisper-bin', WHISPER_BINARY_FILENAME);
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  // Ritorna il path userData (dove verrà scaricato)
  return userDataPath;
}

/**
 * Path del file modello in userData
 */
export function getModelPath(modelName: string): string {
  return path.join(getWhisperDir(), modelName);
}

// --------------- Status ---------------

/**
 * Verifica lo stato del servizio speech-to-text
 */
export function getStatus(config: SpeechToTextConfig): WhisperStatus {
  const binaryPath = getWhisperBinaryPath();
  const modelPath = getModelPath(config.model || 'ggml-small.bin');

  return {
    enabled: config.enabled,
    binaryAvailable: fs.existsSync(binaryPath),
    modelDownloaded: fs.existsSync(modelPath),
    modelName: config.model || 'ggml-small.bin',
    language: config.language || 'it',
  };
}

// --------------- Download generico ---------------

/**
 * Download generico di un file con progress, redirect e file .tmp atomico.
 * Usato sia per il modello che per il binary.
 */
function downloadFile(
  url: string,
  destPath: string,
  estimatedSize: number,
  label: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpPath = destPath + '.tmp';

    if (fs.existsSync(destPath)) {
      log.info(`[Whisper] ${label} già presente: ${destPath}`);
      onProgress({ percent: 100, downloadedBytes: 0, totalBytes: 0 });
      resolve();
      return;
    }

    log.info(`[Whisper] Inizio download ${label} da ${url}`);

    const doRequest = (requestUrl: string, redirectCount: number) => {
      if (redirectCount > 10) {
        reject(new Error('Troppi redirect durante il download'));
        return;
      }

      const parsedUrl = new URL(requestUrl);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const req = protocol.get(requestUrl, (response) => {
        if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            log.info(`[Whisper] Redirect ${response.statusCode} -> ${redirectUrl}`);
            const resolved = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, requestUrl).toString();
            doRequest(resolved, redirectCount + 1);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download ${label} fallito: HTTP ${response.statusCode}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10) || estimatedSize;
        let downloadedBytes = 0;

        const fileStream = fs.createWriteStream(tmpPath);

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          const percent = totalBytes > 0
            ? Math.round((downloadedBytes / totalBytes) * 100)
            : 0;
          onProgress({ percent, downloadedBytes, totalBytes });
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              fs.renameSync(tmpPath, destPath);
              log.info(`[Whisper] Download ${label} completato: ${destPath} (${downloadedBytes} bytes)`);
              resolve();
            } catch (err: any) {
              log.error(`[Whisper] Errore rinomina ${label}:`, err);
              reject(new Error(`Errore finalizzazione download: ${err.message}`));
            }
          });
        });

        fileStream.on('error', (err) => {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
          reject(new Error(`Errore scrittura file: ${err.message}`));
        });
      });

      req.on('error', (err) => {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        reject(new Error(`Errore di rete: ${err.message}`));
      });

      req.setTimeout(600_000, () => {
        req.destroy();
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        reject(new Error(`Timeout download ${label} (10 minuti)`));
      });
    };

    doRequest(url, 0);
  });
}

// --------------- Download binary ---------------

/**
 * Scarica il binary whisper-cli.exe.
 * Il release di whisper.cpp è un .zip, quindi scarichiamo lo zip,
 * estraiamo whisper-cli.exe e puliamo.
 */
export async function downloadBinary(
  onProgress: (progress: DownloadProgress) => void
): Promise<void> {
  const destPath = path.join(getWhisperDir(), WHISPER_BINARY_FILENAME);

  if (fs.existsSync(destPath)) {
    log.info(`[Whisper] Binary già presente: ${destPath}`);
    return;
  }

  // Scarica lo zip
  const zipPath = path.join(getWhisperDir(), 'whisper-cli.zip');
  await downloadFile(WHISPER_BINARY_URL, zipPath, 5_000_000, 'binary whisper', onProgress);

  // Estrai whisper-cli.exe dallo zip
  log.info('[Whisper] Estrazione binary dallo zip...');
  try {
    await extractExeFromZip(zipPath, destPath);
    // Pulizia zip
    try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
    log.info(`[Whisper] Binary estratto: ${destPath}`);
  } catch (err: any) {
    // Pulizia in caso di errore
    try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
    try { fs.unlinkSync(destPath); } catch { /* ignore */ }
    throw new Error(`Errore estrazione binary: ${err.message}`);
  }
}

/**
 * Estrae whisper-cli.exe e le DLL necessarie da uno zip.
 * Lo zip contiene una cartella Release/ con l'exe e le DLL dipendenti.
 * Implementazione minimale senza dipendenze esterne: usa
 * il comando PowerShell Expand-Archive su Windows.
 */
function extractExeFromZip(zipPath: string, destExePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const extractDir = path.join(getWhisperDir(), '_extract_tmp');
    const whisperDir = getWhisperDir();

    // Usa PowerShell per estrarre (disponibile su Windows 7+ con PS 5.0+)
    const psCommand = `
      $ErrorActionPreference = 'Stop';
      if (Test-Path '${extractDir.replace(/'/g, "''")}') { Remove-Item '${extractDir.replace(/'/g, "''")}' -Recurse -Force };
      Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force;
    `;

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], { timeout: 60_000 }, (error) => {
      if (error) {
        try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
        reject(new Error(`Errore estrazione zip: ${error.message}`));
        return;
      }

      // Cerca whisper-cli.exe nella cartella estratta (può essere in sottocartella)
      try {
        const exeFile = findFileRecursive(extractDir, WHISPER_BINARY_FILENAME);
        if (!exeFile) {
          throw new Error(`${WHISPER_BINARY_FILENAME} non trovato nello zip`);
        }

        // Copia l'exe
        fs.copyFileSync(exeFile, destExePath);

        // Copia anche le DLL necessarie dalla stessa cartella dell'exe
        const exeDir = path.dirname(exeFile);
        const entries = fs.readdirSync(exeDir);
        for (const entry of entries) {
          if (entry.toLowerCase().endsWith('.dll')) {
            const srcDll = path.join(exeDir, entry);
            const destDll = path.join(whisperDir, entry);
            fs.copyFileSync(srcDll, destDll);
            log.info(`[Whisper] DLL copiata: ${entry}`);
          }
        }

        // Pulizia cartella temporanea
        fs.rmSync(extractDir, { recursive: true, force: true });
        resolve();
      } catch (err: any) {
        try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
        reject(err);
      }
    });
  });
}

/**
 * Cerca un file ricorsivamente in una directory
 */
function findFileRecursive(dir: string, filename: string): string | null {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(fullPath, filename);
      if (found) return found;
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return fullPath;
    }
  }
  return null;
}

// --------------- Download modello ---------------

/**
 * Scarica un modello Whisper da Hugging Face con progress callback.
 */
export async function downloadModel(
  modelName: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<void> {
  const url = MODEL_URLS[modelName];
  if (!url) {
    throw new Error(`Modello sconosciuto: ${modelName}. Modelli disponibili: ${Object.keys(MODEL_URLS).join(', ')}`);
  }

  const modelPath = getModelPath(modelName);
  const estimatedSize = MODEL_SIZES[modelName] || 0;

  await downloadFile(url, modelPath, estimatedSize, `modello ${modelName}`, onProgress);
}

// --------------- Trascrizione ---------------

/**
 * Trascrive un buffer audio WAV usando whisper.cpp
 *
 * @param audioBuffer - Buffer contenente audio WAV (16-bit PCM, 16kHz, mono)
 * @param config - Configurazione speech-to-text
 * @returns Risultato trascrizione con testo e durata elaborazione
 */
export function transcribe(
  audioBuffer: Buffer,
  config: SpeechToTextConfig
): Promise<TranscriptionResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const binaryPath = getWhisperBinaryPath();
    const modelPath = getModelPath(config.model || 'ggml-small.bin');

    // Verifica prerequisiti
    if (!fs.existsSync(binaryPath)) {
      resolve({ success: false, error: 'Binary whisper-cli.exe non trovato', durationMs: 0 });
      return;
    }
    if (!fs.existsSync(modelPath)) {
      resolve({ success: false, error: `Modello ${config.model} non scaricato`, durationMs: 0 });
      return;
    }

    // Scrivi audio in file temporaneo
    const tempWavPath = path.join(os.tmpdir(), `dictation_${Date.now()}.wav`);
    try {
      fs.writeFileSync(tempWavPath, audioBuffer);
    } catch (err: any) {
      resolve({ success: false, error: `Errore scrittura file temporaneo: ${err.message}`, durationMs: 0 });
      return;
    }

    // Calcola thread da usare (lascia 2 thread per OS/Electron)
    const threads = Math.max(1, os.cpus().length - 2);

    log.info(`[Whisper] Trascrizione: model=${config.model}, lang=${config.language}, threads=${threads}, audioSize=${audioBuffer.length}`);

    execFile(
      binaryPath,
      [
        '-m', modelPath,
        '-l', config.language || 'it',
        '-f', tempWavPath,
        '--no-timestamps',
        '-otxt',
        '-t', String(threads),
      ],
      { timeout: 120_000, cwd: path.dirname(binaryPath) },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;

        // whisper -otxt scrive <inputfile>.txt
        const txtPath = tempWavPath + '.txt';

        if (error) {
          log.error(`[Whisper] Errore esecuzione (${durationMs}ms):`, error.message);
          if (stderr) log.error('[Whisper] stderr:', stderr);
          cleanup(tempWavPath, txtPath);
          resolve({
            success: false,
            error: `Errore trascrizione: ${error.message}`,
            durationMs,
          });
          return;
        }

        try {
          let text = '';
          if (fs.existsSync(txtPath)) {
            text = fs.readFileSync(txtPath, 'utf8').trim();
          } else if (stdout) {
            // Fallback: leggi da stdout
            text = stdout.trim();
          }

          // Pulizia artefatti Whisper:
          // - Annotazioni tra parentesi: [sattirazione], [musica], (applausi)
          // - Virgolette che Whisper aggiunge attorno al testo
          text = text
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .trim()
            .replace(/^["""«»'']+|["""«»'']+$/g, '')
            .trim();

          if (!text) {
            log.info(`[Whisper] Nessun testo rilevato (${durationMs}ms)`);
            resolve({
              success: true,
              text: '',
              durationMs,
            });
          } else {
            log.info(`[Whisper] Trascrizione completata (${durationMs}ms): ${text.substring(0, 100)}...`);
            resolve({
              success: true,
              text,
              durationMs,
            });
          }
        } catch (readErr: any) {
          log.error('[Whisper] Errore lettura risultato:', readErr);
          resolve({
            success: false,
            error: 'Impossibile leggere il risultato della trascrizione',
            durationMs,
          });
        } finally {
          cleanup(tempWavPath, txtPath);
        }
      }
    );
  });
}

/**
 * Pulisce i file temporanei della trascrizione
 */
function cleanup(...filePaths: string[]): void {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignora errori di pulizia
    }
  }
}
