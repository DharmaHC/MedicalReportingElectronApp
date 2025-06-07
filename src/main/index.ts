// src/main/index.ts
import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import isDev from 'electron-is-dev';
import { signPdfService } from './signPdfService';
import os from 'os';
import path from 'path';
import * as pkcs11js from 'pkcs11js';
import fs from 'fs';
import log from 'electron-log';
import { execFile } from 'child_process';

// Inserisci il path corretto di SumatraPDF.exe
const SUMATRA_PATH = 'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe'; // <-- Cambia qui!

// Configura electron-log anche per autoUpdater
autoUpdater.logger = log;

log.info('App starting...');

let isForceClosing = false;
let proceedCloseTriggered = false;

// ---------------- SETTINGS & UTILS ----------------
interface Settings {
  yPosLogo: number;
  logoWidth: number;
  logoHeight: number;
  yPosFooterImage: number;
  footerImageWidth: number;
  footerImageHeight: number;
  footerImageXPositionOffset: number;
  footerTextFontFamily: string;
  footerTextPointFromBottom: number;
  footerTextFontSize: number;
  footerCompanyDataPointFromBottom: number;
  footerCompanyDataMultiline: boolean,
  printSignedPdfIfAvailable: boolean;
  pkcs11Lib: string;
  cspSlotIndex: number;
  remoteSignUrl: string;
  tsaUrl: string;
  useMRAS: boolean;
  showAppMenu: boolean;
  reportPageWidth: number;
  reportPageHeight: number;
  editorZoomDefault: number;
}

export function loadGlobalSettings(): Settings {
  const baseDir = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(process.cwd(), 'src/renderer/assets');

  const settingsPath = path.join(baseDir, 'sign-settings.json');
  if (!fs.existsSync(settingsPath)) {
    throw new Error(`sign-settings.json non trovato in ${settingsPath}`);
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(raw) as Settings;
  } catch (err) {
    throw new Error(`Errore lettura/parsing sign-settings.json: ${err}`);
  }
}

ipcMain.handle('verify-pin', async (_ev, pin: string) => {
  console.log('[VERIFY-PIN] Inizio verifica PIN');
  console.log(`[VERIFY-PIN] PIN ricevuto: ${pin ? `[${pin.length} caratteri]` : 'null/undefined'}`);
  
  let pkcs11: any = null;
  let sess: any = null;
  let slot: any = null;
  let settings: any = null;
  
  try {
    // Caricamento impostazioni globali
    console.log('[VERIFY-PIN] Caricamento impostazioni globali...');
    settings = await loadGlobalSettings();
    console.log('[VERIFY-PIN] Impostazioni caricate:', {
      pkcs11Lib: settings.pkcs11Lib,
      cspSlotIndex: settings.cspSlotIndex,
      hasSettings: !!settings
    });
    
    // Inizializzazione PKCS11
    console.log('🔧 [VERIFY-PIN] Inizializzazione PKCS11...');
    pkcs11 = new pkcs11js.PKCS11();
    console.log('✅ [VERIFY-PIN] Oggetto PKCS11 creato');
    
    // Caricamento libreria PKCS11
    console.log(`📚 [VERIFY-PIN] Caricamento libreria: ${settings.pkcs11Lib}`);
    pkcs11.load(settings.pkcs11Lib);
    console.log('✅ [VERIFY-PIN] Libreria PKCS11 caricata');
    
    // Inizializzazione PKCS11
    console.log('🚀 [VERIFY-PIN] Inizializzazione C_Initialize...');
    pkcs11.C_Initialize();
    console.log('✅ [VERIFY-PIN] C_Initialize completata');
    
    try {
      // Ottenimento lista slot
      console.log('🎰 [VERIFY-PIN] Ottenimento lista slot...');
      const slotList = pkcs11.C_GetSlotList(true);
      console.log('✅ [VERIFY-PIN] Lista slot ottenuta:', {
        totalSlots: slotList.length,
        slotList: slotList,
        requestedIndex: settings.cspSlotIndex ?? 0
      });
      
      if (slotList.length === 0) {
        throw new Error('Nessuno slot disponibile');
      }
      
      const slotIndex = settings.cspSlotIndex ?? 0;
      if (slotIndex >= slotList.length) {
        throw new Error(`Indice slot ${slotIndex} non valido. Slot disponibili: 0-${slotList.length - 1}`);
      }
      
      slot = slotList[slotIndex];
      console.log(`🎯 [VERIFY-PIN] Slot selezionato: ${slot} (indice: ${slotIndex})`);
      
      // Apertura sessione
      console.log('🔓 [VERIFY-PIN] Apertura sessione...');
      const sessionFlags = pkcs11js.CKF_SERIAL_SESSION | pkcs11js.CKF_RW_SESSION;
      console.log(`📝 [VERIFY-PIN] Flag sessione: ${sessionFlags}`);
      
      sess = pkcs11.C_OpenSession(slot, sessionFlags);
      console.log(`✅ [VERIFY-PIN] Sessione aperta con ID: ${sess}`);
      
      // Login utente
      console.log('👤 [VERIFY-PIN] Tentativo di login utente...');
      console.log(`🔑 [VERIFY-PIN] Tipo utente: ${pkcs11js.CKU_USER}`);
      
      pkcs11.C_Login(sess, pkcs11js.CKU_USER, pin);
      console.log('✅ [VERIFY-PIN] Login utente riuscito');
      
      // Logout
      console.log('👋 [VERIFY-PIN] Esecuzione logout...');
      pkcs11.C_Logout(sess);
      console.log('✅ [VERIFY-PIN] Logout completato');
      
      // Chiusura sessione
      console.log('🔒 [VERIFY-PIN] Chiusura sessione...');
      pkcs11.C_CloseSession(sess);
      console.log('✅ [VERIFY-PIN] Sessione chiusa');
      
      console.log('🎉 [VERIFY-PIN] Verifica PIN completata con successo');
      return true;
      
    } catch (err: any) {
      console.error('❌ [VERIFY-PIN] Errore durante le operazioni PKCS11:', {
        message: err.message,
        code: err.code,
        stack: err.stack,
        name: err.name
      });
      
      // Cleanup parziale in caso di errore
      try {
        if (sess) {
          console.log('🧹 [VERIFY-PIN] Tentativo di chiusura sessione dopo errore...');
          pkcs11.C_CloseSession(sess);
          console.log('✅ [VERIFY-PIN] Sessione chiusa dopo errore');
        }
      } catch (cleanupErr) {
        console.error('⚠️ [VERIFY-PIN] Errore durante cleanup sessione:', cleanupErr);
      }
      
      let msg = 'Errore PIN';
      let errorCode = err.code;
      
      console.log(`🔍 [VERIFY-PIN] Analisi codice errore: ${errorCode}`);
      
      if (err.code === 160) {
        msg = 'PIN errato';
        console.log('🚫 [VERIFY-PIN] PIN errato rilevato');
      } else if (err.code === 164) {
        msg = 'PIN bloccato';
        console.log('🔒 [VERIFY-PIN] PIN bloccato rilevato');
      } else {
        console.log(`❓ [VERIFY-PIN] Codice errore sconosciuto: ${errorCode}`);
      }
      
      console.log(`📤 [VERIFY-PIN] Creazione errore personalizzato: "${msg}"`);
      const e = new Error(msg);
      (e as any).code = errorCode;
      throw e;
    }
    
  } catch (err: any) {
    console.error('💥 [VERIFY-PIN] Errore generale nella funzione:', {
      message: err.message,
      code: err.code,
      stack: err.stack,
      name: err.name,
      phase: 'general'
    });
    
    // Se l'errore non è già stato processato, lo rilanciamo
    if (err.message === 'PIN errato' || err.message === 'PIN bloccato' || err.message === 'Errore PIN') {
      console.log('🔄 [VERIFY-PIN] Rilancio errore già processato');
      throw err;
    }
    
    // Errore non gestito, creiamo un errore generico
    console.log('🆕 [VERIFY-PIN] Creazione errore generico per errore non gestito');
    const genericError = new Error('Errore durante la verifica del PIN');
    (genericError as any).code = err.code || 'UNKNOWN';
    (genericError as any).originalError = err;
    throw genericError;
    
  } finally {
    console.log('🧹 [VERIFY-PIN] Inizio cleanup finale...');
    
    try {
      if (pkcs11) {
        console.log('🔚 [VERIFY-PIN] Finalizzazione PKCS11...');
        pkcs11.C_Finalize();
        console.log('✅ [VERIFY-PIN] PKCS11 finalizzato');
      }
    } catch (finalizeErr:any) {
      console.error('⚠️ [VERIFY-PIN] Errore durante finalizzazione PKCS11:', {
        message: finalizeErr.message,
        code: finalizeErr.code,
        stack: finalizeErr.stack
      });
    }
    
    console.log('🏁 [VERIFY-PIN] Cleanup finale completato');
  }
});

// ------ SETTINGS HANDLER ------
let settingsCache: Settings | null = null;

async function loadSettingsFileCached(): Promise<Settings> {
  if (!settingsCache) {
    settingsCache = await loadGlobalSettings();
  }
  return settingsCache;
}

ipcMain.handle('appSettings:get', async () => {
  return await loadSettingsFileCached();
});

ipcMain.handle('appSettings:reload', async () => {
  settingsCache = null;
  return await loadSettingsFileCached();
});

// ------ PDF SIGN IPC ------
ipcMain.handle('sign-pdf', async (_e, req) => {
  return signPdfService(req);
});

// ------ PDF SIGN IPC ------
ipcMain.on('print-pdf-native', async (event, pdfBase64: string) => {
  try {
    // 1. Scrivi il file temporaneo PDF
    const tempPath = path.join(os.tmpdir(), `stampa_${Date.now()}.pdf`);
    log.info('[PRINT] Ricevuto print-pdf-native. tempPath:', tempPath);

    try {
      fs.writeFileSync(tempPath, Buffer.from(pdfBase64, 'base64'));
      log.info('[PRINT] PDF temporaneo scritto:', tempPath);
    } catch (writeErr) {
      log.error('[PRINT] Errore scrittura file temporaneo:', writeErr);
      event.sender.send('print-pdf-native-result', { success: false, error: 'Errore scrittura file PDF temporaneo: ' + writeErr });
      dialog.showErrorBox('Stampa fallita', 'Errore scrittura file PDF temporaneo: ' + writeErr);
      return;
    }

    // 2. Comando per stampa silenziosa (senza GUI, diretta sulla stampante predefinita)
    const args = [
      '-print-to-default',
      '-silent',
      tempPath
    ];

    if (!fs.existsSync(SUMATRA_PATH)) {
      log.error('[PRINT] SumatraPDF non trovato:', SUMATRA_PATH);
      event.sender.send('print-pdf-native-result', { success: false, error: 'SumatraPDF non trovato' });
      dialog.showErrorBox('Stampa fallita', 'SumatraPDF non trovato su questo PC.');
      // Elimina comunque il file temporaneo se presente
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      return;
    }
    log.info('[PRINT] Lancio SumatraPDF:', SUMATRA_PATH, args);

    execFile(SUMATRA_PATH, args, (error, stdout, stderr) => {
      if (error) {
        const errMessage = error + ' ' + stdout + ' ' + stderr;
        log.error('Errore stampa Sumatra:', errMessage);
        event.sender.send('print-pdf-native-result', { success: false, error: errMessage });
        dialog.showErrorBox('Errore stampa', errMessage);
      } else {
        event.sender.send('print-pdf-native-result', { success: true });
      }

      // Cleanup file temporaneo
      setTimeout(() => {
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
            log.info('[PRINT] File temporaneo eliminato:', tempPath);
          }
        } catch (delErr) {
          log.error('[PRINT] Errore eliminazione file temporaneo:', delErr);
        }
      }, 10000);
    });

  } catch (err) {
    // Catch di errori NON previsti (es. errori sincroni, permessi, out-of-memory ecc.)
    log.error('[PRINT] Errore imprevisto in print-pdf-native:', err);
    event.sender.send('print-pdf-native-result', { success: false, error: 'Errore imprevisto: ' + err });
    dialog.showErrorBox('Stampa fallita', 'Errore imprevisto: ' + err);
  }
});


// ---------------- MAIN WINDOW ----------------
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const isDevMode = !app.isPackaged;

  // --- Preload path ---
  const preloadPath = isDevMode
    ? path.join(process.cwd(), 'preload', 'index.js')
    : path.join(process.resourcesPath, 'preload', 'index.js');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: false,
    maximizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  mainWindow.maximize();

  // 3. Parametrizza la visualizzazione del menu
 const settings = loadGlobalSettings();
   if (!settings.showAppMenu) {
    Menu.setApplicationMenu(null);
  }

  mainWindow.closable = false;
  console.log('[DEBUG] IsDevMode: ', isDevMode);

    const indexPath = isDevMode
        ? 'http://localhost:5173'
        : path.resolve(__dirname, '..', 'renderer', 'index.html');
    if (isDevMode) {
      mainWindow.loadURL(indexPath);
      mainWindow.webContents.openDevTools();
    } else {
      mainWindow.loadFile(indexPath);
    }

  // Intercetta la richiesta di chiusura della finestra
mainWindow.on('close', (e) => {
  console.log('Evento close', { isForceClosing });
  // resto del codice
});

 ipcMain.on('proceed-close', () => {
   if (!proceedCloseTriggered && mainWindow) {
   console.log('proceedCloseTriggered', { proceedCloseTriggered });
     proceedCloseTriggered = true;
     isForceClosing = true;
   console.log('mainWindow.close()');
     mainWindow.close();
    console.log('proceedCloseTriggered', { proceedCloseTriggered });
   }
 });
}

ipcMain.on('app-quit', () => {
  console.log('IPC: app-quit ricevuto')
  if (mainWindow) {
    mainWindow.closable = true;
    app.quit();
    mainWindow.close();
  }
});

// ---------------- AUTO UPDATE (electron-updater) ----------------
function setupAutoUpdater() {
  // Avvia subito la ricerca aggiornamenti (solo se non in dev!)
  if (isDev) return;

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
    if (mainWindow) {
      dialog.showErrorBox('Errore aggiornamento', `${err == null ? "unknown" : (err.stack || err).toString()}`);
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    log.info(`Download speed: ${progressObj.bytesPerSecond}`);
    log.info(`Downloaded ${progressObj.percent}%`);
    log.info(`${progressObj.transferred} / ${progressObj.total}`);
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded', info);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Aggiornamento disponibile',
        message: 'Una nuova versione è stata scaricata. L\'app verrà chiusa per installare l\'aggiornamento.',
        buttons: ['Ok']
      }).then(() => {
        setImmediate(() => autoUpdater.quitAndInstall());
      });
    } else {
      setImmediate(() => autoUpdater.quitAndInstall());
    }
  });
}

// ---------------- APP READY ----------------
app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

// ---------------- CLOSE BEHAVIOR ---------------
// app.on('window-all-closed', () => {
//   if (process.platform !== 'darwin') {
//     app.quit();
//   }
// });

// app.on('activate', () => {
//   if (mainWindow === null) {
//     createWindow();
//   }
// });
