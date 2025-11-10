// src/main/index.ts
import { app, BrowserWindow, Menu, MenuItem, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import isDev from 'electron-is-dev';
import { signPdfService } from './signPdfService';
import os from 'os';
import path from 'path';
import * as pkcs11js from 'pkcs11js';
import fs from 'fs';
import log from 'electron-log';
import { execFile } from 'child_process';
import { loadConfigJson, initializeAllConfigs } from './configManager';
import type { CompanyUISettings } from '../globals';

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
  rowsPerPage: number;
  highlightPlaceholder: boolean;
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

  // ---------------- IPC HANDLERS ----------------
  // Forza il focus sulla finestra principale
  ipcMain.on('focus-main-window', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.show();        // se era nascosta
      win.focus();       // forza il focus
    }
  });


  ipcMain.on('show-context-menu', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const menu = new Menu();

    menu.append(new MenuItem({
      label: 'Copia',
      click: () => {
        event.sender.copy(); // oppure clipboard.writeText(event.sender.getSelectedText()) in preload
      }
    }));

    menu.append(new MenuItem({
      label: 'Taglia',
      click: () => {
        event.sender.cut();
      }
    }));

    menu.append(new MenuItem({
      label: 'Incolla',
      click: () => {
        event.sender.paste();
      }
    }));

    menu.append(new MenuItem({
      label: 'Seleziona Tutto',
      click: () => {
        event.sender.selectAll();
      }
    }));

    // menu.append(new MenuItem({
    //   label: '_____________________',
    // }));

    // menu.append(new MenuItem({
    //   label: 'Zoom In',
    //   click: () => {
    //     event.sender.zoomLevel += 0.5;
    //   }
    // }));

    // menu.append(new MenuItem({
    //   label: 'Zoom Out',
    //   click: () => {
    //     event.sender.zoomLevel -= 0.5;
    //   }
    // }));

    // menu.append(new MenuItem({
    //   label: 'Reset Zoom',
    //   click: () => {
    //     event.sender.zoomLevel = 0;
    //   }
    // }));

    // eventualmente altri item

    menu.popup({ window: win! });
  });

ipcMain.handle('verify-pin', async (_ev, pin: string) => {
  let pkcs11: any = null;
  let sess: any = null;
  let slot: any = null;
  let settings: any = null;

  try {
    // Carica le impostazioni globali
    settings = await loadGlobalSettings();

    // Inizializza PKCS11
    pkcs11 = new pkcs11js.PKCS11();
    pkcs11.load(settings.pkcs11Lib);
    pkcs11.C_Initialize();

    try {
      // Ottieni lista slot con token presente
      const slotList = pkcs11.C_GetSlotList(true);

      if (!slotList || slotList.length === 0) {
        throw new Error('Nessuno slot disponibile');
      }

      const slotIndex = settings.cspSlotIndex ?? 0;
      if (slotIndex >= slotList.length) {
        throw new Error(`Indice slot ${slotIndex} non valido. Slot disponibili: 0-${slotList.length - 1}`);
      }

      slot = slotList[slotIndex];

      // Apri sessione
      const sessionFlags = pkcs11js.CKF_SERIAL_SESSION | pkcs11js.CKF_RW_SESSION;
      sess = pkcs11.C_OpenSession(slot, sessionFlags);

      // Login utente
      pkcs11.C_Login(sess, pkcs11js.CKU_USER, pin);

      // Logout e chiusura sessione
      pkcs11.C_Logout(sess);
      pkcs11.C_CloseSession(sess);

      // Finalizza PKCS11 (già dentro finally, ma safe qui)
      try { pkcs11.C_Finalize(); } catch {}

      // Verifica PIN riuscita
      return true;

    } catch (err: any) {
      // Cleanup in caso di errore durante sessione
      try { if (sess) pkcs11.C_CloseSession(sess); } catch {}

      // Mappa errori specifici
      let msg: string;
      let errorCode = err.code;

      if (err.message === 'Nessuno slot disponibile') {
        msg = 'Nessuno slot disponibile';
      } else if (errorCode === 160) {
        msg = 'PIN errato';
      } else if (errorCode === 164) {
        msg = 'PIN bloccato';
      } else if (err.message && typeof err.message === 'string') {
        msg = err.message;
      } else {
        msg = 'Errore PIN';
      }

      const e = new Error(msg);
      (e as any).code = errorCode;
      throw e;
    }
  } catch (err: any) {
    // Errori gestiti (li rilancia per essere intercettati nel renderer)
    if (
      err.message === 'PIN errato' ||
      err.message === 'PIN bloccato' ||
      err.message === 'Errore PIN' ||
      err.message === 'Nessuno slot disponibile'
    ) {
      throw err;
    }

    // Qualsiasi altro errore sconosciuto/fallback
    const genericError = new Error('Errore durante la verifica del PIN');
    (genericError as any).code = err.code || 'UNKNOWN';
    (genericError as any).originalError = err;
    throw genericError;
  } finally {
    // Cleanup PKCS11
    try { if (pkcs11) pkcs11.C_Finalize(); } catch {}
  }
});

const logPath = path.join(app.getPath('userData'), 'medreport-editor.log');

ipcMain.on('log-to-file', (event, logMsg, logOptions = {}) => {
  try {
    const username = logOptions.username || "ND";
    const line = `[${new Date().toISOString()}][${username}] ${logMsg}\n`;
    fs.appendFileSync(logPath, line, 'utf8');
  } catch (e) {
    // Fallback in console
    console.error("Errore log-to-file:", e);
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

// ------ COMPANY FOOTER SETTINGS IPC ------
ipcMain.handle('get-company-footer-settings', async (_event, companyId: string) => {
  const { getCompanyFooterSettings } = require('./signPdfService');
  return getCompanyFooterSettings(companyId);
});

// ------ COMPANY UI SETTINGS IPC ------
ipcMain.handle('get-company-ui-settings', async () => {
  // Valori di default se il file non esiste
  const defaultSettings: CompanyUISettings = {
    header: {
      logo: {
        url: "https://referti.asterdiagnostica.it/images/logo.png",
        link: "http://www.asterdiagnostica.it/",
        alt: "Logo Aster"
      },
      title: {
        text: "Refertazione Medica",
        color: "rgb(34, 154, 97)",
        fontSize: "30px"
      }
    },
    footer: {
      copyright: "© 2017 Aster Diagnostica - Direttore Sanitario: Dott. Girardi Domingo",
      poweredBy: {
        text: "Powered by",
        link: "https://www.dharmahealthcare.net",
        name: "Dharma Healthcare"
      }
    },
    emergencyWorkaround: {
      enabled: false,
      bypassPin: false,
      bypassSignature: false,
      overrideDoctorName: null
    },
    logipacsServer: {
      baseUrl: "http://172.16.18.52/LPW/Display",
      username: "radiologia",
      password: "radiologia"
    },
    useExternalIdSystem: false
  };

  return loadConfigJson<CompanyUISettings>('company-ui-settings.json', defaultSettings);
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
  // Inizializza i file di configurazione personalizzati al primo avvio
  initializeAllConfigs();

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
