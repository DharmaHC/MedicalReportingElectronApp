"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// req per la Firma digitale
electron_1.contextBridge.exposeInMainWorld('nativeSign', {
    signPdf: (req) => electron_1.ipcRenderer.invoke('sign-pdf', req),
    verifyPin: (pin) => electron_1.ipcRenderer.invoke('verify-pin', pin),
});
// Espone API appSettings, usando SOLO ipcRenderer!
electron_1.contextBridge.exposeInMainWorld('appSettings', {
    get: () => electron_1.ipcRenderer.invoke('appSettings:get'),
    reload: () => electron_1.ipcRenderer.invoke('appSettings:reload'),
});
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    onUpdateAvailable: (callback) => electron_1.ipcRenderer.on('update-available', (_event, info) => callback(info)),
    onDownloadProgress: (callback) => electron_1.ipcRenderer.on('download-progress', (_event, progress) => callback(progress)),
});
