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
  // Decora PDF senza firma (per "Salva da Firmare")
  decoratePdf: (req: {
    pdfBase64: string,
    companyId?: string,
    footerText?: string
  }) => ipcRenderer.invoke('decorate-pdf', req),
  // Aggiunge dicitura firma a PDF già decorato
  addSignatureNotice: (req: {
    pdfBase64: string,
    signedByName: string
  }) => ipcRenderer.invoke('add-signature-notice', req),
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
      password?: string;  // Password certificato (Namirial la richiede separata dal PIN)
      pin: string;
      otp: string;
      sessionMinutes?: number;
      isAutomatic?: boolean; // true per firma automatica senza OTP
    }) => ipcRenderer.invoke('remote-sign:authenticate', params),

    // Recupera le credenziali salvate per firma automatica (password decriptata dal backend)
    getStoredCredentials: (params: {
      token: string;
      apiBaseUrl: string;
    }) => ipcRenderer.invoke('remote-sign:get-stored-credentials', params),

    // Ottiene lo stato della sessione corrente
    getSessionStatus: (params: { providerId: string }) =>
      ipcRenderer.invoke('remote-sign:get-session-status', params),

    // Avvia la firma batch di più referti
    startBulkSign: (params: {
      reports: Array<{
        digitalReportId: string;  // GUID da DigitalSignedReports
        examinationId: number;
        linkedResultIds: number[];
        patientLastName: string;
        patientFirstName: string;
        companyId: string;
        doctorCode: string;
      }>;
      providerId: string;
      token: string;
      apiBaseUrl: string;
      signedByName: string;  // Nome firmatario per dicitura firma
    }) => ipcRenderer.invoke('remote-sign:bulk-sign', params),

    // Chiude la sessione corrente
    closeSession: (params: { providerId: string }) =>
      ipcRenderer.invoke('remote-sign:close-session', params),

    // --- Supporto Namirial SaaS/On-Premises ---

    // Ottiene informazioni sull'endpoint Namirial corrente
    getNamirialEndpointInfo: () =>
      ipcRenderer.invoke('remote-sign:get-namirial-endpoint-info'),

    // Cambia endpoint Namirial (SaaS <-> On-Premises)
    switchNamirialEndpoint: (params: { useOnPremise: boolean }) =>
      ipcRenderer.invoke('remote-sign:switch-namirial-endpoint', params),

    // Salva configurazione endpoint Namirial (persiste in sign-settings.json)
    saveNamirialEndpointConfig: (params: { useOnPremise: boolean }) =>
      ipcRenderer.invoke('remote-sign:save-namirial-endpoint-config', params),

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
      digitalReportId: string;
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

  // ============================================================================
  // API per Amministrazione Provider Firma Remota (solo admin)
  // ============================================================================
  console.log('[PRELOAD] Registering remoteSignAdmin API...');
  contextBridge.exposeInMainWorld('remoteSignAdmin', {
    // --- Configurazione OpenAPI ---
    getOpenApiConfig: () => ipcRenderer.invoke('remote-sign-admin:get-openapi-config'),
    saveOpenApiConfig: (config: { baseUrl: string; apiKey: string; token: string; certificateType: string }) =>
      ipcRenderer.invoke('remote-sign-admin:save-openapi-config', config),

    // --- Certificati ---
    openApiGetCertificates: () => ipcRenderer.invoke('remote-sign-admin:openapi-get-certificates'),
    openApiRegisterCertificate: (params: {
      certificateOwner: string;
      customReference?: string;
    }) => ipcRenderer.invoke('remote-sign-admin:openapi-register-certificate', params),
    openApiPatchCertificate: (params: { certificateId: string; updates: any }) =>
      ipcRenderer.invoke('remote-sign-admin:openapi-patch-certificate', params),

    // --- Firme ---
    openApiGetSignatures: () => ipcRenderer.invoke('remote-sign-admin:openapi-get-signatures'),
    openApiDeleteSignature: (params: { signatureId: string }) =>
      ipcRenderer.invoke('remote-sign-admin:openapi-delete-signature', params),

    // --- Verifica ---
    openApiVerifyDocument: (params: { documentBase64: string; documentName: string }) =>
      ipcRenderer.invoke('remote-sign-admin:openapi-verify-document', params),

    // --- Test Firma ---
    openApiTestSignOtp: (params: { otp: string }) =>
      ipcRenderer.invoke('remote-sign-admin:openapi-test-sign-otp', params),
    openApiTestSignAutomatic: () =>
      ipcRenderer.invoke('remote-sign-admin:openapi-test-sign-automatic'),
    openApiTestEseal: () =>
      ipcRenderer.invoke('remote-sign-admin:openapi-test-eseal'),
    openApiTestSes: () =>
      ipcRenderer.invoke('remote-sign-admin:openapi-test-ses'),
  });
  console.log('[PRELOAD] remoteSignAdmin API registered!');

  // ============================================================================
  // API per Speech-to-Text (Dettatura Vocale locale con Whisper)
  // ============================================================================
  contextBridge.exposeInMainWorld('speechToText', {
    getStatus: () => ipcRenderer.invoke('speech-to-text:get-status'),
    downloadModel: () => ipcRenderer.invoke('speech-to-text:download-model'),
    transcribe: (audioBuffer: ArrayBuffer) => ipcRenderer.invoke('speech-to-text:transcribe', audioBuffer),
    onDownloadProgress: (callback: (progress: {
      percent: number;
      downloadedBytes: number;
      totalBytes: number;
    }) => void) => {
      ipcRenderer.on('speech-to-text:download-progress', (_event: any, progress: any) => callback(progress));
    },
    removeDownloadProgressListener: () => {
      ipcRenderer.removeAllListeners('speech-to-text:download-progress');
    },
  });
  console.log('[PRELOAD] speechToText API registered!');

  // ============================================================================
  // API per WPF RadRichTextBox Editor (editor RTF nativo)
  // ============================================================================
  contextBridge.exposeInMainWorld('wpfEditor', {
    start: () => ipcRenderer.invoke('wpf-editor:start'),
    loadRtf: (rtfBase64: string) => ipcRenderer.invoke('wpf-editor:load-rtf', rtfBase64),
    getRtf: () => ipcRenderer.invoke('wpf-editor:get-rtf'),
    getPdf: () => ipcRenderer.invoke('wpf-editor:get-pdf'),
    show: () => ipcRenderer.invoke('wpf-editor:show'),
    hide: () => ipcRenderer.invoke('wpf-editor:hide'),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('wpf-editor:set-bounds', bounds),
    isReady: () => ipcRenderer.invoke('wpf-editor:is-ready'),
    setParent: () => ipcRenderer.invoke('wpf-editor:set-parent'),
    insertText: (text: string) => ipcRenderer.invoke('wpf-editor:insert-text', text),
    setZoom: (zoomPercent: number) => ipcRenderer.invoke('wpf-editor:set-zoom', zoomPercent),
    focus: () => ipcRenderer.invoke('wpf-editor:focus'),
    stop: () => ipcRenderer.invoke('wpf-editor:stop'),
  });
  console.log('[PRELOAD] wpfEditor API registered!');

