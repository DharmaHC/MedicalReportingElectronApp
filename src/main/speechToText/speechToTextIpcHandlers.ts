/**
 * speechToTextIpcHandlers.ts
 * Handler IPC per la dettatura vocale locale con Whisper.
 * Pattern identico a remoteSignIpcHandlers.ts
 */

import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';
import { loadGlobalSettings } from '../index';
import {
  getStatus,
  downloadBinary,
  downloadModel,
  transcribe,
} from './whisperService';

/**
 * Registra tutti gli IPC handler per speech-to-text.
 * Chiamata da src/main/index.ts all'avvio dell'app.
 */
export function registerSpeechToTextIpcHandlers(): void {

  // Stato del servizio (binary disponibile, modello scaricato, ecc.)
  ipcMain.handle('speech-to-text:get-status', async () => {
    try {
      const settings = loadGlobalSettings();
      const config = settings.speechToText;
      if (!config || !config.enabled) {
        return {
          enabled: false,
          binaryAvailable: false,
          modelDownloaded: false,
          modelName: config?.model || 'ggml-small.bin',
          language: config?.language || 'it',
        };
      }
      return getStatus(config);
    } catch (err: any) {
      log.error('[SpeechToText IPC] Errore get-status:', err);
      return { enabled: false, error: err.message };
    }
  });

  // Setup completo: scarica binary + modello con progress
  ipcMain.handle('speech-to-text:download-model', async (event) => {
    try {
      const settings = loadGlobalSettings();
      const config = settings.speechToText;
      if (!config?.enabled) {
        return { success: false, error: 'Speech-to-text non abilitato nelle impostazioni' };
      }

      const win = BrowserWindow.fromWebContents(event.sender);
      const sendProgress = (progress: { percent: number; downloadedBytes: number; totalBytes: number }) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('speech-to-text:download-progress', progress);
        }
      };

      // 1. Scarica il binary se mancante
      const status = getStatus(config);
      if (!status.binaryAvailable) {
        log.info('[SpeechToText IPC] Download binary whisper-cli...');
        sendProgress({ percent: 0, downloadedBytes: 0, totalBytes: 0 });
        await downloadBinary(sendProgress);
      }

      // 2. Scarica il modello se mancante
      if (!status.modelDownloaded) {
        log.info(`[SpeechToText IPC] Download modello ${config.model}...`);
        sendProgress({ percent: 0, downloadedBytes: 0, totalBytes: 0 });
        await downloadModel(config.model || 'ggml-small.bin', sendProgress);
      }

      return { success: true };
    } catch (err: any) {
      log.error('[SpeechToText IPC] Errore download:', err);
      return { success: false, error: err.message };
    }
  });

  // Trascrivi buffer audio
  ipcMain.handle('speech-to-text:transcribe', async (_event, audioBuffer: ArrayBuffer) => {
    try {
      const settings = loadGlobalSettings();
      const config = settings.speechToText;
      if (!config?.enabled) {
        return { success: false, error: 'Speech-to-text non abilitato nelle impostazioni' };
      }

      const buffer = Buffer.from(audioBuffer);
      return await transcribe(buffer, config);
    } catch (err: any) {
      log.error('[SpeechToText IPC] Errore transcribe:', err);
      return { success: false, error: err.message };
    }
  });

  log.info('[SpeechToText IPC] Handler registrati');
}
