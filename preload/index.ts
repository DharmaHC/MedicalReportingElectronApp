import { contextBridge, ipcRenderer } from 'electron';

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

// Espone API appSettings, usando SOLO ipcRenderer!
contextBridge.exposeInMainWorld('appSettings', {
  get: () => ipcRenderer.invoke('appSettings:get'),
  reload: () => ipcRenderer.invoke('appSettings:reload'),
});

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateAvailable: (callback: (info: any) => void) =>
    ipcRenderer.on('update-available', (_event, info) => callback(info)),
  onDownloadProgress: (callback: (progress: any) => void) =>
    ipcRenderer.on('download-progress', (_event, progress) => callback(progress)),
});

