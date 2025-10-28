import { contextBridge, ipcRenderer } from 'electron';

console.log("PRELOAD PARTITO!");

// req per la Firma digitale
  contextBridge.exposeInMainWorld('nativeSign', {
  signPdf: (req: {
    pdfBase64 : string,
    companyId?: string,
    footerText?: string,
    pin?: string,
    useRemote?: boolean,
    otpCode?: string,
    userCN?: string
  }) => ipcRenderer.invoke('sign-pdf', req),
  verifyPin: (pin: string) => ipcRenderer.invoke('verify-pin', pin),
});


// Espone l'API ipcRenderer per comunicare con il main process
  contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
      send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
      on: (channel: string, listener: (...args: any[]) => void) => ipcRenderer.on(channel, listener),
      once: (channel: string, listener: (...args: any[]) => void) => ipcRenderer.once(channel, listener),
      removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
      invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    }
  });

  // Espone API appSettings, usando SOLO ipcRenderer!
  contextBridge.exposeInMainWorld('appSettings', {
    get: () => ipcRenderer.invoke('appSettings:get'),
    reload: () => ipcRenderer.invoke('appSettings:reload'),
  });

  // Espone API per company UI settings
  contextBridge.exposeInMainWorld('companyUISettings', {
    get: () => ipcRenderer.invoke('get-company-ui-settings'),
  });

  contextBridge.exposeInMainWorld('electronAPI', {
    onUpdateAvailable: (callback: (info: any) => void) =>
      ipcRenderer.on('update-available', (_event, info) => callback(info)),
    onDownloadProgress: (callback: (progress: any) => void) =>
      ipcRenderer.on('download-progress', (_event, progress) => callback(progress)),
  });

