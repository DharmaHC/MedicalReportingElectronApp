// src/main/index.ts
import { app, BrowserWindow, Menu, MenuItem, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import isDev from 'electron-is-dev';
import { signPdfService, decoratePdfOnly, addSignatureNoticeToBuffer } from './signPdfService';
import os from 'os';
import path from 'path';
import * as pkcs11js from 'pkcs11js';
import fs from 'fs';
import log from 'electron-log';
import { execFile } from 'child_process';
import { loadConfigJson, initializeAllConfigs, migrateOldConfigStructure, syncAllConfigsWithDefaults, isPerMachineInstallation, migrateNamirialUrl, getDefaultConfigDir, getCustomConfigDir } from './configManager';
import type { CompanyUISettings, Settings } from '../globals';
import {
  initializeRemoteSignProviders,
  registerRemoteSignIpcHandlers,
  cleanupRemoteSign
} from './remoteSign/remoteSignIpcHandlers';
import { registerRemoteSignAdminHandlers } from './remoteSign/remoteSignAdminIpcHandlers';
import { registerSpeechToTextIpcHandlers } from './speechToText/speechToTextIpcHandlers';
import { registerWpfEditorIpcHandlers, stopWpfEditor } from './wpfEditor';

// Disabilita accelerazione hardware GPU per permettere alle finestre WPF child
// (embedded via SetParent/WS_CHILD) di renderizzare sopra il contenuto Chromium
app.disableHardwareAcceleration();

// Inserisci il path corretto di SumatraPDF.exe
const SUMATRA_PATH = 'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe'; // <-- Cambia qui!

// Configura electron-log anche per autoUpdater
autoUpdater.logger = log;

log.info('App starting...');

// ============================================================================
// 🚀 MedReportAndSign - Version Info
// ============================================================================
console.log("=".repeat(80));
console.log(`🚀 MedReportAndSign v${app.getVersion()}`);
console.log(`📱 Platform: ${process.platform} (${process.arch})`);
console.log("✅ Cross-platform smartcard support (Windows & macOS)");
console.log("✅ Bit4id Firma4NG / Keyfour drivers supported");
console.log("=".repeat(80));
// ============================================================================

let isForceClosing = false;
let proceedCloseTriggered = false;

// ---------------- SETTINGS & UTILS ----------------

/**
 * Valori di fallback per sign-settings.json
 * Usati solo se il file non esiste o è corrotto
 */
const DEFAULT_SETTINGS: Settings = {
  yPosLogo: 0,
  logoWidth: 0,
  logoHeight: 0,
  yPosFooterImage: 0,
  footerImageWidth: 0,
  footerImageHeight: 0,
  footerImageXPositionOffset: 0,
  footerTextFontFamily: "Times New Roman",
  footerTextPointFromBottom: 20,
  footerTextFontSize: 8,
  footerCompanyDataPointFromBottom: 0,
  footerCompanyDataMultiline: 1, // 1 = true, 0 = false (defined as number in globals.d.ts)
  blankFooterHeight: 50,
  printSignedPdfIfAvailable: true,
  reportPageWidth: 210,
  reportPageHeight: 297,
  editorZoomDefault: 1.3,
  rowsPerPage: 30,
  highlightPlaceholder: false,
  pkcs11Lib: "C:\\Windows\\System32\\bit4xpki.dll",
  cspSlotIndex: 0,
  remoteSignUrl: "https://mio-server-remote-sign.example.com/sign",
  tsaUrl: "https://freetsa.org/tsr",
  useMRAS: true,
  showAppMenu: false,
  signatureTextLine1: "Referto firmato digitalmente ai sensi degli art. 20, 21 n.2, 23 e 24 del d.Lgs. n.82 del 7.3.2015 e successive modifiche da: ",
  signatureTextLine2: "{signedBy} in data: {date}",
  speechToText: {
    enabled: false,
    model: 'ggml-small.bin',
    language: 'it'
  }
};

/**
 * Carica le impostazioni globali usando il sistema di merge intelligente
 *
 * LOGICA:
 * 1. Carica il file DEFAULT da resources/assets (sempre aggiornato con nuovi campi)
 * 2. Se esiste il file PERSONALIZZATO in ProgramData/assets, fa il merge
 * 3. Risultato: tutti i nuovi campi + personalizzazioni preservate
 *
 * @returns Settings con merge intelligente default + custom
 */
export function loadGlobalSettings(): Settings {
  const settings = loadConfigJson<Settings>('sign-settings.json', DEFAULT_SETTINGS);
  return settings;
}

/**
 * Carica settings con informazioni di debug sulla provenienza di ogni campo
 * @returns Oggetto con settings e info sulla provenienza
 */
/**
 * Carica un file di configurazione con info debug sulla provenienza di ogni campo
 */
function loadConfigWithDebugInfo(filename: string): {
  settings: Record<string, any>;
  sources: Record<string, 'default' | 'custom'>;
  paths: { default: string; custom: string; customExists: boolean };
} {
  const defaultPath = path.join(getDefaultConfigDir(), filename);
  const customPath = path.join(getCustomConfigDir(), filename);

  let defaultConfig: Record<string, any> = {};
  if (fs.existsSync(defaultPath)) {
    try {
      defaultConfig = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
    } catch (err) {
      log.error(`Error loading default ${filename}:`, err);
    }
  }

  let customConfig: Record<string, any> | null = null;
  const customExists = fs.existsSync(customPath);
  if (customExists) {
    try {
      customConfig = JSON.parse(fs.readFileSync(customPath, 'utf8'));
    } catch (err) {
      log.error(`Error loading custom ${filename}:`, err);
    }
  }

  // Usa loadConfigJson per ottenere il risultato finale (merged)
  const finalSettings = loadConfigJson<Record<string, any>>(filename, defaultConfig);

  // Determina provenienza di ogni campo (top-level)
  const sources: Record<string, 'default' | 'custom'> = {};
  for (const key in finalSettings) {
    sources[key] = (customConfig && key in customConfig) ? 'custom' : 'default';
  }

  return {
    settings: finalSettings,
    sources,
    paths: { default: defaultPath, custom: customPath, customExists }
  };
}

function loadSettingsWithDebugInfo() {
  return loadConfigWithDebugInfo('sign-settings.json');
}

/**
 * Registra window.debugSettings() nella console DevTools.
 * Il log dettagliato viene fatto dal renderer via IPC debug:getSettings.
 */
export function logSettingsToConsole(mainWindow: BrowserWindow | null): void {
  if (!mainWindow) return;

  try {
    mainWindow.webContents.executeJavaScript(`
      (function() {
        window.debugSettings = function() {
          return window.electron.ipcRenderer.invoke('debug:getSettings').then(function(all) {
            Object.keys(all).forEach(function(filename) {
              var d = all[filename];
              console.log('%c ' + filename, 'color: #00aaff; font-weight: bold; font-size: 13px');
              console.log('  Default:', d.paths.default);
              console.log('  Custom:', d.paths.customExists ? d.paths.custom : '(non esiste)');
              console.table(Object.keys(d.settings).map(function(key) {
                var v = d.settings[key];
                return { Setting: key, Valore: typeof v === 'object' ? JSON.stringify(v) : String(v), Provenienza: d.sources[key] === 'custom' ? 'Personalizzato' : 'Default' };
              }));
            });
            return all;
          });
        };
      })();
    `);
    log.info('window.debugSettings() registered');
  } catch (err) {
    log.error('Error registering debugSettings:', err);
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

    // Inizializza PKCS11 con rilevamento piattaforma
    pkcs11 = new pkcs11js.PKCS11();

    // Rileva la piattaforma
    const isMac = process.platform === 'darwin';
    const isWindows = process.platform === 'win32';
    console.log(`🖥️ [verify-pin] Piattaforma rilevata: ${process.platform} (isMac: ${isMac}, isWindows: ${isWindows})`);

    // Lista di librerie PKCS#11 da provare (in ordine di priorità)
    const pkcs11Libraries = [
      settings.pkcs11Lib, // Libreria configurata dall'utente

      // Librerie Windows
      ...(isWindows ? [
        'C:\\Windows\\System32\\bit4xpki.dll', // Bit4id extended (firma4ng, token moderni)
        'C:\\Windows\\System32\\bit4ipki.dll', // Bit4id standard (smartcard tradizionali)
        'C:\\Windows\\System32\\bit4opki.dll', // Bit4id OTP
      ] : []),

      // Librerie macOS
      ...(isMac ? [
        '/usr/local/lib/libbit4xpki.dylib', // Bit4id extended
        '/usr/local/lib/libbit4ipki.dylib', // Bit4id standard
        '/usr/local/lib/libbit4opki.dylib', // Bit4id OTP
        '/Library/Frameworks/bit4xpki.framework/bit4xpki', // Framework format
        '/Library/Frameworks/bit4ipki.framework/bit4ipki',
        '/opt/homebrew/lib/libbit4xpki.dylib', // Homebrew installation (Apple Silicon)
        '/opt/homebrew/lib/libbit4ipki.dylib',
        '/Applications/Firma4NG Keyfour.app/Contents/Resources/utilities/mac/PKCS11/libbit4xpki.dylib', // Firma4NG Keyfour
        '/Applications/Firma4NG Keyfour.app/Contents/Resources/System/Firma4NG.app/Contents/Resources/libbit4xpki.dylib', // Firma4NG alt
        '/usr/local/lib/opensc-pkcs11.so', // OpenSC generic driver (Intel)
        '/opt/homebrew/lib/opensc-pkcs11.so', // OpenSC generic driver (Apple Silicon)
      ] : []),
    ].filter((lib, index, self) => lib && self.indexOf(lib) === index); // Rimuovi duplicati e null

    console.log(`📚 [verify-pin] Librerie PKCS#11 da provare: ${pkcs11Libraries.length} percorsi`);
    pkcs11Libraries.forEach((lib, idx) => console.log(`   ${idx + 1}. ${lib}`));

    let loadedLib: string | null = null;
    let initError: Error | null = null;

    // Prova a caricare le librerie in sequenza
    for (const libPath of pkcs11Libraries) {
      try {
        console.log(`🔐 [verify-pin] Tentativo caricamento libreria PKCS#11: ${libPath}`);
        pkcs11.load(libPath);
        pkcs11.C_Initialize();
        loadedLib = libPath;
        console.log(`✅ [verify-pin] Libreria PKCS#11 caricata con successo: ${libPath}`);
        break; // Successo, esci dal loop
      } catch (err: any) {
        console.warn(`⚠️ [verify-pin] Impossibile caricare ${libPath}: ${err.message}`);
        initError = err;
        // Prova la prossima libreria
      }
    }

    if (!loadedLib) {
      console.error(`❌ [verify-pin] NESSUNA LIBRERIA PKCS#11 DISPONIBILE`);
      throw new Error(`Impossibile caricare il driver della smartcard. Ultimo errore: ${initError?.message || 'Sconosciuto'}`);
    }

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

// ------ DEBUG SETTINGS IPC ------
ipcMain.handle('debug:getSettings', () => {
  return {
    'sign-settings.json': loadConfigWithDebugInfo('sign-settings.json'),
    'company-footer-settings.json': loadConfigWithDebugInfo('company-footer-settings.json'),
    'company-ui-settings.json': loadConfigWithDebugInfo('company-ui-settings.json'),
  };
});

// ------ APP INFO IPC ------
ipcMain.handle('app:getInfo', async () => {
  return {
    version: app.getVersion(),
    installationType: isPerMachineInstallation() ? 'perMachine' : 'perUser',
    platform: process.platform,
    arch: process.arch
  };
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
    useExternalIdSystem: false,
    zoomFactor: 1.0
  };

  return loadConfigJson<CompanyUISettings>('company-ui-settings.json', defaultSettings);
});

// ------ PDF SIGN IPC ------
ipcMain.handle('sign-pdf', async (_e, req) => {
  return signPdfService(req);
});

// ------ DECORATE PDF (senza firma) per "Salva da Firmare" ------
ipcMain.handle('decorate-pdf', async (_e, req) => {
  return decoratePdfOnly(req);
});

// ------ ADD SIGNATURE NOTICE (aggiunge dicitura firma) ------
ipcMain.handle('add-signature-notice', async (_e, req) => {
  return addSignatureNoticeToBuffer(req);
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
    ? path.join(process.cwd(), 'renderer-dist', 'preload', 'index.js')
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

  // Espone i settings nella console del browser quando la pagina è caricata
  mainWindow.webContents.on('did-finish-load', () => {
    logSettingsToConsole(mainWindow);

    // Applica zoom generale dall'impostazione company-ui-settings
    const uiSettings = loadConfigJson<CompanyUISettings>('company-ui-settings.json', { zoomFactor: 1.0 } as CompanyUISettings);
    const zoom = uiSettings.zoomFactor;
    if (zoom && zoom > 0 && mainWindow) {
      mainWindow.webContents.setZoomFactor(zoom);
      console.log(`[ZOOM] Zoom factor applicato: ${zoom} (${Math.round(zoom * 100)}%)`);
    }
  });

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

// ---------------- GHOST INSTALLATION CLEANUP ----------------
/**
 * Copia ricorsiva di una directory (src → dest), sovrascrivendo i file esistenti.
 */
function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Rimuove installazioni fantasma create dal bug nell'installer.nsh (pre v1.0.57).
 *
 * Il preInit cancellava le chiavi di registro prima che NSIS determinasse $INSTDIR,
 * causando l'installazione in una nuova directory invece di aggiornare quella esistente.
 * Risultato: directory fantasma con productName diverso nella stessa cartella Programs.
 *
 * Prima di cancellare, copia gli assets (JSON config + immagini) dalla ghost directory
 * nella directory corrente, cosi' eventuali file piu' aggiornati vengono preservati.
 */
function cleanupGhostInstallation(): void {
  if (process.platform !== 'win32' || !app.isPackaged) return;

  try {
    const exePath = app.getPath('exe');
    const installDir = path.dirname(exePath);
    const parentDir = path.dirname(installDir);
    const currentDirName = path.basename(installDir);

    // Solo per installazioni perUser (%LOCALAPPDATA%\Programs\)
    if (!installDir.toLowerCase().includes('\\appdata\\local\\programs\\')) {
      return;
    }

    // Determina la directory ghost in base alla directory corrente
    let ghostName: string | null = null;
    if (currentDirName === 'MedReportAndSign') {
      ghostName = 'MedReport';
    } else if (currentDirName === 'MedReport') {
      ghostName = 'MedReportAndSign';
    }

    if (!ghostName) return;

    const ghostDir = path.join(parentDir, ghostName);
    if (!fs.existsSync(ghostDir)) return;

    // Sicurezza: non cancellare la propria directory
    if (ghostDir.toLowerCase() === installDir.toLowerCase()) {
      log.warn(`[GhostCleanup] Ghost dir matches current dir, skipping`);
      return;
    }

    log.info(`[GhostCleanup] Found ghost installation at: ${ghostDir}`);
    log.info(`[GhostCleanup] Current installation at: ${installDir}`);

    // Copia assets (JSON config + immagini) dalla ghost alla directory corrente
    const ghostAssets = path.join(ghostDir, 'resources', 'assets');
    const currentAssets = path.join(installDir, 'resources', 'assets');
    if (fs.existsSync(ghostAssets)) {
      try {
        copyDirRecursive(ghostAssets, currentAssets);
        log.info(`[GhostCleanup] Copied assets from ghost to current installation`);
      } catch (copyErr: any) {
        log.warn(`[GhostCleanup] Could not copy assets: ${copyErr.message}`);
      }
    }

    // Rimuovi la directory ghost
    fs.rmSync(ghostDir, { recursive: true, force: true });
    log.info(`[GhostCleanup] Successfully removed ghost installation`);
  } catch (err: any) {
    log.warn(`[GhostCleanup] Could not remove ghost installation: ${err.message}`);
  }
}

// ---------------- AUTO UPDATE (electron-updater) ----------------
function setupAutoUpdater() {
  // Avvia subito la ricerca aggiornamenti (solo se non in dev!)
  if (isDev) return;

  // Su macOS, disabilita l'autoUpdater se l'app non è firmata
  // Altrimenti causerebbe errori 404 cercando latest-mac.yml
  if (process.platform === 'darwin') {
    log.info('AutoUpdater disabilitato su macOS (app non firmata)');
    return;
  }

  autoUpdater.channel = 'win7';
  autoUpdater.allowDowngrade = false;
  log.info(`AutoUpdater configurato per il canale: ${autoUpdater.channel}`);

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
    // Log l'errore ma non mostrare dialog all'utente
    // (errori comuni: 404 su latest.yml se non ci sono release)
    log.error('Error in auto-updater:', err);
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
  // 1. Migra eventuali configurazioni dalla vecchia struttura (config → assets)
  //    Controlla TUTTE le posizioni possibili: ProgramData e AppData
  migrateOldConfigStructure();

  // 2. Inizializza i file di configurazione personalizzati al primo avvio
  //    Copia i default nella cartella personalizzata se non esistono
  initializeAllConfigs();

  // 3. Sincronizza i file personalizzati con i nuovi default
  //    Aggiunge eventuali nuovi parametri mantenendo le personalizzazioni
  syncAllConfigsWithDefaults();

  // 3.1 Migrazione URL Namirial (da eSignAnyWhere errato a SWS corretto)
  migrateNamirialUrl();

  // 4. Inizializza i provider di firma remota e registra gli IPC handlers
  const settings = loadGlobalSettings();
  if (settings.remoteSign) {
    initializeRemoteSignProviders(settings.remoteSign);
  }
  registerRemoteSignIpcHandlers();

  // Registra gli handler admin con error handling
  try {
    log.info('[Main] Chiamata registerRemoteSignAdminHandlers...');
    registerRemoteSignAdminHandlers();
    log.info('[Main] registerRemoteSignAdminHandlers completata');
  } catch (err: any) {
    log.error('[Main] ERRORE in registerRemoteSignAdminHandlers:', err.message, err.stack);
  }

  // Registra gli handler speech-to-text (dettatura vocale locale)
  try {
    registerSpeechToTextIpcHandlers();
  } catch (err: any) {
    log.error('[Main] ERRORE registrazione speech-to-text:', err.message, err.stack);
  }

  // Registra gli handler per l'editor WPF RadRichTextBox
  try {
    registerWpfEditorIpcHandlers();
    log.info('[Main] WPF Editor IPC handlers registrati');
  } catch (err: any) {
    log.error('[Main] ERRORE registrazione WPF Editor:', err.message, err.stack);
  }

  // Pulizia installazioni fantasma da bug auto-update pre v1.0.57
  cleanupGhostInstallation();

  createWindow();
  setupAutoUpdater();
});

// ---------------- CLOSE BEHAVIOR ---------------
app.on('before-quit', async () => {
  // Cleanup delle sessioni di firma remota
  await cleanupRemoteSign();
  // Termina il processo WPF editor
  stopWpfEditor();
});

app.on('window-all-closed', () => {
  // Su macOS le app rimangono attive anche quando tutte le finestre sono chiuse
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // Su macOS, quando si clicca l'icona nel Dock, ricrea la finestra se non esiste
  if (mainWindow === null || BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    // Se la finestra esiste ma è nascosta, mostrala
    mainWindow.show();
    mainWindow.focus();
  }
});
