"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
console.log("PRELOAD PARTITO!");
// req per la Firma digitale
electron_1.contextBridge.exposeInMainWorld('nativeSign', {
    signPdf: (req) => electron_1.ipcRenderer.invoke('sign-pdf', req),
    verifyPin: (pin) => electron_1.ipcRenderer.invoke('verify-pin', pin),
});
// Espone l'API ipcRenderer per comunicare con il main process
electron_1.contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        send: (channel, ...args) => electron_1.ipcRenderer.send(channel, ...args),
        on: (channel, listener) => electron_1.ipcRenderer.on(channel, listener),
        once: (channel, listener) => electron_1.ipcRenderer.once(channel, listener),
        removeAllListeners: (channel) => electron_1.ipcRenderer.removeAllListeners(channel),
    }
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
