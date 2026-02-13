/**
 * WPF RadRichTextEditor companion process manager.
 *
 * Spawns MedReportEditor.exe (WPF) and communicates via Named Pipe.
 * Protocol: newline-delimited JSON over a Named Pipe.
 *
 * Commands (Electron → WPF):
 *   LOAD_RTF  { command, data: base64 }
 *   GET_RTF   { command }
 *   GET_PDF   { command }
 *   SHOW      { command }
 *   HIDE      { command }
 *   SET_BOUNDS { command, x, y, width, height }
 *   SET_ZOOM  { command, zoom }
 *   FOCUS     { command }
 *   PING      { command }
 *
 * Events (WPF → Electron):
 *   READY        - pipe connected, editor ready
 *   OK           - command acknowledged
 *   RTF_CONTENT  - response to GET_RTF, { type, data: base64 }
 *   PDF_CONTENT  - response to GET_PDF, { type, data: base64 }
 *   ERROR        - { type, message }
 */

import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import { app, ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

const PIPE_PREFIX = '\\\\.\\pipe\\';
let wpfProcess: ChildProcess | null = null;
let pipeClient: net.Socket | null = null;
let pipeName: string = '';
let isReady = false;
let readyResolve: (() => void) | null = null;
let pendingCallbacks: Map<string, { resolve: (value: any) => void; reject: (reason: any) => void }> = new Map();
let messageBuffer = '';
let isEditorVisible = false;
let windowListenersSetup = false;
let lastBoundsPayload: { x: number; y: number; width: number; height: number } | null = null;

/**
 * Restituisce il path dell'eseguibile WPF.
 * In development: dalla cartella build del progetto WPF.
 * In produzione: dalla cartella resources dell'app Electron.
 */
function getWpfExePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'wpf-editor', 'MedReportEditor.exe');
  }
  // Dev: build output del progetto WPF
  return path.join(
    __dirname,
    '..', '..', 'MedReportEditor.Wpf', 'bin', 'Debug', 'net8.0-windows', 'MedReportEditor.exe'
  );
}

/**
 * Avvia il processo WPF e connette il Named Pipe.
 * Attende il messaggio READY dal WPF prima di ritornare.
 */
export async function startWpfEditor(): Promise<void> {
  if (wpfProcess && !wpfProcess.killed) {
    log.info('[WPF Editor] Processo gia\' attivo');
    return;
  }

  pipeName = `MedReportEditor_${process.pid}_${Date.now()}`;
  const exePath = getWpfExePath();

  log.info(`[WPF Editor] Avvio: ${exePath} --pipe ${pipeName}`);

  // Pulisci TELERIK_LICENSE env var (troncata a 4095 char su Windows)
  // per forzare il WPF a usare telerik-license.txt dal suo cwd
  const env = { ...process.env };
  delete env.TELERIK_LICENSE;

  wpfProcess = spawn(exePath, ['--pipe', pipeName], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env,
    cwd: path.dirname(exePath),
  });

  wpfProcess.stdout?.on('data', (data: Buffer) => {
    log.info(`[WPF stdout] ${data.toString().trim()}`);
  });

  wpfProcess.stderr?.on('data', (data: Buffer) => {
    log.error(`[WPF stderr] ${data.toString().trim()}`);
  });

  wpfProcess.on('exit', (code) => {
    log.info(`[WPF Editor] Processo terminato con codice ${code}`);
    wpfProcess = null;
    pipeClient = null;
    isReady = false;
    isEditorVisible = false;
    // Reject all pending callbacks
    for (const [id, cb] of pendingCallbacks) {
      cb.reject(new Error('WPF process exited'));
    }
    pendingCallbacks.clear();
  });

  // Connetti al pipe e attendi il messaggio READY dal WPF
  await connectToPipe(pipeName);
  await waitForReady(15000);
  log.info('[WPF Editor] Pronto per ricevere comandi');
}

/**
 * Attende che il WPF invii il messaggio READY (max timeoutMs).
 */
function waitForReady(timeoutMs: number): Promise<void> {
  if (isReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    readyResolve = resolve;
    const timer = setTimeout(() => {
      readyResolve = null;
      reject(new Error(`WPF Editor READY timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    // Se isReady diventa true, readyResolve viene chiamato in handleMessage
    const origResolve = readyResolve;
    readyResolve = () => {
      clearTimeout(timer);
      origResolve?.();
      resolve();
    };
  });
}

/**
 * Invia un comando SET_PARENT per rendere la finestra WPF figlia della finestra Electron.
 * Il handle nativo viene ottenuto da BrowserWindow.
 */
export async function setParentWindow(): Promise<void> {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    log.warn('[WPF Editor] Nessuna BrowserWindow trovata per setParent');
    return;
  }
  const hwndBuf = win.getNativeWindowHandle();
  // Il buffer contiene un handle nativo (pointer) in formato little-endian
  // Su Windows 64-bit e' un BigInt, ma WPF accetta un long
  const hwnd = hwndBuf.length >= 8
    ? hwndBuf.readBigInt64LE(0).toString()
    : hwndBuf.readInt32LE(0).toString();
  log.info(`[WPF Editor] SET_PARENT hwnd=${hwnd}`);
  await sendCommand('SET_PARENT', { hwnd });
}

/**
 * Connette al Named Pipe del processo WPF con retry.
 */
async function connectToPipe(name: string, maxRetries = 20, delayMs = 500): Promise<void> {
  const pipePath = PIPE_PREFIX + name;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const client = net.connect(pipePath, () => {
          pipeClient = client;
          messageBuffer = '';

          client.on('data', (data: Buffer) => {
            let text = data.toString('utf-8');
            // Strip BOM se presente (UTF-8 BOM = \uFEFF)
            if (messageBuffer.length === 0 && text.charCodeAt(0) === 0xFEFF) {
              text = text.substring(1);
            }
            messageBuffer += text;
            processMessageBuffer();
          });

          client.on('end', () => {
            log.info('[WPF Editor] Pipe disconnesso');
            pipeClient = null;
            isReady = false;
          });

          client.on('error', (err) => {
            log.error(`[WPF Editor] Errore pipe: ${err.message}`);
          });

          resolve();
        });

        client.on('error', (err) => {
          reject(err);
        });
      });

      log.info(`[WPF Editor] Connesso al pipe ${pipePath}`);
      return; // Connessione riuscita
    } catch {
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  throw new Error(`Impossibile connettersi al pipe ${pipePath} dopo ${maxRetries} tentativi`);
}

/**
 * Processa il buffer dei messaggi (newline-delimited JSON).
 */
function processMessageBuffer(): void {
  const lines = messageBuffer.split('\n');
  // L'ultima parte potrebbe essere incompleta
  messageBuffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      handleMessage(msg);
    } catch (err) {
      log.error(`[WPF Editor] JSON parse error: ${line}`);
    }
  }
}

/**
 * Gestisce un messaggio ricevuto dal processo WPF.
 */
function handleMessage(msg: any): void {
  if (msg.type === 'READY') {
    isReady = true;
    log.info('[WPF Editor] Editor pronto');
    if (readyResolve) {
      readyResolve();
      readyResolve = null;
    }
    return;
  }

  // Risposte a comandi pendenti
  if (msg.type === 'OK' && msg.command) {
    const cb = pendingCallbacks.get(msg.command);
    if (cb) {
      pendingCallbacks.delete(msg.command);
      cb.resolve(msg);
    }
    return;
  }

  if (msg.type === 'RTF_CONTENT') {
    const cb = pendingCallbacks.get('GET_RTF');
    if (cb) {
      pendingCallbacks.delete('GET_RTF');
      cb.resolve(msg.data); // base64
    }
    return;
  }

  if (msg.type === 'PDF_CONTENT') {
    const cb = pendingCallbacks.get('GET_PDF');
    if (cb) {
      pendingCallbacks.delete('GET_PDF');
      cb.resolve(msg.data); // base64
    }
    return;
  }

  if (msg.type === 'IS_DIRTY') {
    const cb = pendingCallbacks.get('IS_DIRTY');
    if (cb) {
      pendingCallbacks.delete('IS_DIRTY');
      cb.resolve(msg.dirty);
    }
    return;
  }

  if (msg.type === 'PONG') {
    const cb = pendingCallbacks.get('PING');
    if (cb) {
      pendingCallbacks.delete('PING');
      cb.resolve(true);
    }
    return;
  }

  if (msg.type === 'ERROR') {
    log.error(`[WPF Editor] Errore: ${msg.message}`);
    // Reject il primo callback pendente
    const first = pendingCallbacks.entries().next().value;
    if (first) {
      const [id, cb] = first;
      pendingCallbacks.delete(id);
      cb.reject(new Error(msg.message));
    }
    return;
  }
}

/**
 * Invia un comando al processo WPF e attende la risposta.
 */
function sendCommand(command: string, data?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!pipeClient || !isReady) {
      reject(new Error('WPF Editor non connesso'));
      return;
    }

    pendingCallbacks.set(command, { resolve, reject });

    const msg = data ? { command, ...data } : { command };
    const json = JSON.stringify(msg) + '\n';

    pipeClient.write(json, 'utf-8', (err) => {
      if (err) {
        pendingCallbacks.delete(command);
        reject(err);
      }
    });

    // Timeout 30s
    setTimeout(() => {
      if (pendingCallbacks.has(command)) {
        pendingCallbacks.delete(command);
        reject(new Error(`Timeout comando ${command}`));
      }
    }, 30000);
  });
}

/**
 * Carica contenuto RTF nell'editor WPF.
 */
export async function loadRtf(rtfBase64: string): Promise<void> {
  await sendCommand('LOAD_RTF', { data: rtfBase64 });
}

/**
 * Ottiene il contenuto RTF corrente dall'editor.
 */
export async function getRtf(): Promise<string> {
  return await sendCommand('GET_RTF');
}

/**
 * Ottiene il PDF dal documento corrente nell'editor.
 */
export async function getPdf(): Promise<string> {
  return await sendCommand('GET_PDF');
}

/**
 * Mostra la finestra WPF.
 */
export async function showEditor(): Promise<void> {
  await sendCommand('SHOW');
  isEditorVisible = true;
  setupWindowListeners();
}

/**
 * Nasconde la finestra WPF.
 */
export async function hideEditor(): Promise<void> {
  await sendCommand('HIDE');
  isEditorVisible = false;
}

/**
 * Forza il focus sull'editor WPF (utile dopo switch da altra finestra).
 */
export async function focusEditor(): Promise<void> {
  if (!isReady || !isEditorVisible) return;
  await sendCommand('FOCUS');
}

/**
 * Registra listener sulla BrowserWindow per:
 * - Riposizionare l'overlay WPF quando Electron si sposta (l'overlay e' top-level, non si
 *   muove automaticamente col parent). Solo 'move', non 'resize' (il resize e' gestito dal
 *   frontend via ResizeObserver che invia nuovi bounds).
 * - Ri-focalizzare l'editor WPF quando Electron viene riattivato (Alt+Tab back).
 */
function setupWindowListeners(): void {
  if (windowListenersSetup) return;
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  windowListenersSetup = true;

  // Quando Electron si sposta, riposiziona overlay (coords relative invariate,
  // ClientToScreen nel WPF ricalcola le coords schermo)
  win.on('move', () => {
    if (isEditorVisible && isReady && lastBoundsPayload) {
      sendCommand('SET_BOUNDS', lastBoundsPayload).catch(() => {});
    }
  });

  // Auto-focus WPF quando Electron viene riattivato da Alt+Tab
  win.on('focus', () => {
    if (isEditorVisible && isReady) {
      setTimeout(() => {
        sendCommand('FOCUS').catch(() => {});
      }, 50);
    }
  });
}

/**
 * Imposta posizione e dimensioni della finestra WPF.
 */
export async function setBounds(x: number, y: number, width: number, height: number): Promise<void> {
  lastBoundsPayload = { x, y, width, height };
  await sendCommand('SET_BOUNDS', lastBoundsPayload);
}

/**
 * Inserisce testo alla posizione corrente del cursore nell'editor WPF.
 */
export async function insertText(text: string): Promise<void> {
  await sendCommand('INSERT_TEXT', { text });
}

/**
 * Imposta il livello di zoom dell'editor WPF (25-400%).
 */
export async function setZoom(zoomPercent: number): Promise<void> {
  await sendCommand('SET_ZOOM', { zoom: zoomPercent });
}

/**
 * Verifica se il processo WPF e' attivo e connesso.
 */
export function isEditorReady(): boolean {
  return isReady && wpfProcess !== null && !wpfProcess.killed;
}

/**
 * Termina il processo WPF.
 */
export function stopWpfEditor(): void {
  if (wpfProcess && !wpfProcess.killed) {
    wpfProcess.kill();
    wpfProcess = null;
  }
  if (pipeClient) {
    pipeClient.destroy();
    pipeClient = null;
  }
  isReady = false;
  isEditorVisible = false;
  lastBoundsPayload = null;
  pendingCallbacks.clear();
}

/**
 * Registra gli IPC handlers per la comunicazione renderer → main → WPF.
 */
export function registerWpfEditorIpcHandlers(): void {
  ipcMain.handle('wpf-editor:start', async () => {
    await startWpfEditor();
    return true;
  });

  ipcMain.handle('wpf-editor:load-rtf', async (_e, rtfBase64: string) => {
    await loadRtf(rtfBase64);
    return true;
  });

  ipcMain.handle('wpf-editor:get-rtf', async () => {
    return await getRtf();
  });

  ipcMain.handle('wpf-editor:get-pdf', async () => {
    return await getPdf();
  });

  ipcMain.handle('wpf-editor:show', async () => {
    await showEditor();
    return true;
  });

  ipcMain.handle('wpf-editor:hide', async () => {
    await hideEditor();
    return true;
  });

  ipcMain.handle('wpf-editor:set-bounds', async (_e, bounds: { x: number; y: number; width: number; height: number }) => {
    await setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    return true;
  });

  ipcMain.handle('wpf-editor:is-ready', async () => {
    return isEditorReady();
  });

  ipcMain.handle('wpf-editor:set-parent', async () => {
    await setParentWindow();
    return true;
  });

  ipcMain.handle('wpf-editor:insert-text', async (_e, text: string) => {
    await insertText(text);
    return true;
  });

  ipcMain.handle('wpf-editor:set-zoom', async (_e, zoomPercent: number) => {
    await setZoom(zoomPercent);
    return true;
  });

  ipcMain.handle('wpf-editor:focus', async () => {
    await focusEditor();
    return true;
  });

  ipcMain.handle('wpf-editor:stop', async () => {
    stopWpfEditor();
    return true;
  });
}
