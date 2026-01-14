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

  // Espone API per informazioni app (versione, tipo installazione)
  contextBridge.exposeInMainWorld('appInfo', {
    get: () => ipcRenderer.invoke('app:getInfo'),
  });

  contextBridge.exposeInMainWorld('electronAPI', {
    onUpdateAvailable: (callback: (info: any) => void) =>
      ipcRenderer.on('update-available', (_event, info) => callback(info)),
    onDownloadProgress: (callback: (progress: any) => void) =>
      ipcRenderer.on('download-progress', (_event, progress) => callback(progress)),
  });

  // Espone API per informazioni app (versione, tipo installazione)
  contextBridge.exposeInMainWorld('appInfo', {
    get: () => ipcRenderer.invoke('app:getInfo'),
  });

  // ============================================================================
  // API per Firma Remota Massiva
  // ============================================================================
  contextBridge.exposeInMainWorld('remoteSign', {
    // Ottiene la lista dei provider disponibili
    getAvailableProviders: () => ipcRenderer.invoke('remote-sign:get-providers'),

    // Autentica e crea una sessione di firma
    authenticate: (params: {
      providerId: string;
      username: string;
      pin: string;
      otp: string;
      sessionMinutes?: number;
    }) => ipcRenderer.invoke('remote-sign:authenticate', params),

    // Ottiene lo stato della sessione corrente
    getSessionStatus: (params: { providerId: string }) =>
      ipcRenderer.invoke('remote-sign:get-session-status', params),

    // Avvia la firma batch di più referti
    startBulkSign: (params: {
      reports: Array<{
        examinationId: number;
        examResultId: number;
        patientLastName: string;
        patientFirstName: string;
        companyId: string;
      }>;
      providerId: string;
    }) => ipcRenderer.invoke('remote-sign:bulk-sign', params),

    // Chiude la sessione corrente
    closeSession: (params: { providerId: string }) =>
      ipcRenderer.invoke('remote-sign:close-session', params),

    // Event listeners per progresso firma
    onProgress: (callback: (progress: {
      completed: number;
      failed: number;
      total: number;
      currentPatient: string | null;
    }) => void) => {
      ipcRenderer.on('remote-sign:progress', (_event, progress) => callback(progress));
    },

    // Event listener per singolo referto completato
    onReportCompleted: (callback: (result: {
      examinationId: number;
      success: boolean;
      error?: string;
    }) => void) => {
      ipcRenderer.on('remote-sign:report-completed', (_event, result) => callback(result));
    },

    // Event listener per completamento batch
    onCompleted: (callback: (result: {
      total: number;
      successful: number;
      failed: number;
    }) => void) => {
      ipcRenderer.on('remote-sign:completed', (_event, result) => callback(result));
    },

    // Rimuove tutti i listener (cleanup)
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('remote-sign:progress');
      ipcRenderer.removeAllListeners('remote-sign:report-completed');
      ipcRenderer.removeAllListeners('remote-sign:completed');
    }
  });

