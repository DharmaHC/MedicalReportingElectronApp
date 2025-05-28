// src/main/index.ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import isDev from 'electron-is-dev';
import { signPdfService } from './signPdfService';
import path from 'path';
import * as pkcs11js from 'pkcs11js';
import fs from 'fs';
import log from 'electron-log';

// Configura electron-log anche per autoUpdater
autoUpdater.logger = log;

log.info('App starting...');

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
  const settings = await loadGlobalSettings();
  const pkcs11 = new pkcs11js.PKCS11();
  pkcs11.load(settings.pkcs11Lib);
  pkcs11.C_Initialize();
  try {
    const slot = pkcs11.C_GetSlotList(true)[settings.cspSlotIndex ?? 0];
    const sess = pkcs11.C_OpenSession(
      slot,
      pkcs11js.CKF_SERIAL_SESSION | pkcs11js.CKF_RW_SESSION
    );
    pkcs11.C_Login(sess, pkcs11js.CKU_USER, pin);
    pkcs11.C_Logout(sess);
    pkcs11.C_CloseSession(sess);
    return true;
  } catch (err: any) {
    let msg = 'Errore PIN';
    if (err.code === 160) msg = 'PIN errato';
    else if (err.code === 164) msg = 'PIN bloccato';
    const e = new Error(msg);
    (e as any).code = err.code;
    throw e;
  } finally {
    pkcs11.C_Finalize();
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

// ---------------- MAIN WINDOW ----------------
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const isDevMode = !app.isPackaged;

  // --- Preload path ---
  const preloadPath = isDevMode
    ? path.join(process.cwd(), '.vite', 'build', 'preload', 'index.js')
    : path.join(process.resourcesPath, 'preload', 'index.js');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  if (isDevMode) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In produzione, index.html è in dist/index.html dentro app.asar
    const indexPath = path.join(__dirname, 'renderer', 'index.html');
    console.log('Loading file path:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}


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
  //setupAutoUpdater();
});

// ---------------- CLOSE BEHAVIOR ---------------
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
