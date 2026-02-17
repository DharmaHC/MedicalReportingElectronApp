// src/globals.d.ts

// Configurazione provider firma remota
interface RemoteSignProviderConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  /** Token pre-generato (OpenAPI.com) */
  token?: string;
  clientId?: string;
  clientSecret?: string;
  /** URL OAuth per OpenAPI.com */
  oauthUrl?: string;
  /** Tipo certificato/firma OpenAPI: EU-QES_otp, EU-QES_automatic, EU-SES */
  certificateType?: 'EU-QES_otp' | 'EU-QES_automatic' | 'EU-SES';
}

interface RemoteSignConfig {
  defaultProvider: string;
  sessionTimeoutMinutes: number;
  aruba?: RemoteSignProviderConfig;
  infocert?: RemoteSignProviderConfig;
  namirial?: RemoteSignProviderConfig;
  openapi?: RemoteSignProviderConfig;
}

interface SpeechToTextConfig {
  enabled: boolean;
  model: string;       // e.g. 'ggml-small.bin'
  language: string;    // e.g. 'it'
}

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
  footerCompanyDataMultiline: number,
  blankFooterHeight: number;
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
  signatureTextLine1?: string; // Opzionale per retrocompatibilità con vecchie configurazioni
  signatureTextLine2?: string; // Opzionale per retrocompatibilità con vecchie configurazioni
  remoteSign?: RemoteSignConfig; // Configurazione firma remota massiva
  speechToText?: SpeechToTextConfig; // Configurazione dettatura vocale locale (Whisper)
}

interface CompanyFooterSettings {
  footerImageWidth: number;
  footerImageHeight: number;
  blankFooterHeight: number;
  yPosFooterImage: number;
  footerImageXPositionOffset: number;
  footerText: string; // Testo dati aziendali (es. "Aster Diagnostica Srl - P.I. 06191121000")
}

interface EmergencyWorkaround {
  enabled: boolean;
  bypassPin: boolean;
  bypassSignature: boolean;
  overrideDoctorName: string | null;
  notes?: string;
}

interface CompanyUISettings {
  apiBaseUrl?: string; // URL base per le API (opzionale per retrocompatibilità)
  header: {
    logo: {
      url: string;
      link: string;
      alt: string;
    };
    title: {
      text: string;
      color: string;
      fontSize: string;
    };
  };
  footer: {
    copyright: string;
    poweredBy: {
      text: string;
      link: string;
      name: string;
    };
  };
  emergencyWorkaround?: EmergencyWorkaround; // Configurazione workaround per emergenze
  logipacsServer?: {
    baseUrl: string;     // URL base del servizio RemotEye/Logipacs
    username: string;    // Username per l'autenticazione
    password: string;    // Password per l'autenticazione
  };
  useExternalIdSystem?: boolean; // Se true, usa ExternalPatientId e ExternalAccessionNumber per RemotEye
  dicomImageSystemName?: "RemoteEye" | "RemoteEyeLite" | "Other"; // Sistema di visualizzazione immagini DICOM da utilizzare
  zoomFactor?: number; // Zoom generale dell'applicazione (1.0 = 100%, 1.25 = 125%, 0.8 = 80%)
}

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        send: (channel: string, ...args: any[]) => void;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        once: (channel: string, listener: (...args: any[]) => void) => void;
        removeAllListeners: (channel: string) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      }
    },
    appSettings: {
      get: () => Promise<Settings>;
      reload: () => Promise<Settings>;
    },
    companyUISettings: {
      get: () => Promise<CompanyUISettings>;
    },
    appInfo: {
      get: () => Promise<{
        version: string;
        installationType: 'perMachine' | 'perUser';
        platform: string;
        arch: string;
      }>;
    },
    remoteSign: {
      getAvailableProviders: () => Promise<Array<{ id: string; name: string; enabled: boolean }>>;
      authenticate: (params: {
        providerId: string;
        username: string;
        password?: string;  // Password certificato (Namirial la richiede separata dal PIN)
        pin: string;
        otp: string;
        sessionMinutes?: number;
        isAutomatic?: boolean; // true per firma automatica senza OTP
      }) => Promise<{
        success: boolean;
        sessionId?: string;
        expiresAt?: string;
        signedBy?: string;
        error?: string;
      }>;
      getStoredCredentials: (params: {
        token: string;
        apiBaseUrl: string;
      }) => Promise<{
        success: boolean;
        password?: string;
        pin?: string;  // PIN separato per Namirial
        error?: string;
      }>;
      getSessionStatus: (params: { providerId: string }) => Promise<{
        active: boolean;
        expiresAt?: string;
        remainingMinutes?: number;
        signedCount?: number;
      }>;
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
      }) => Promise<{
        success: boolean;
        results?: Array<{ examinationId: number; digitalReportId: string; success: boolean; error?: string }>;
        summary?: { total: number; successful: number; failed: number };
        error?: string;
      }>;
      closeSession: (params: { providerId: string }) => Promise<{ success: boolean; error?: string }>;

      // --- Supporto Namirial SaaS/On-Premises ---
      getNamirialEndpointInfo: () => Promise<{
        success: boolean;
        isOnPremise?: boolean;
        baseUrl?: string;
        hasSaaS?: boolean;
        hasOnPremise?: boolean;
        error?: string;
      }>;
      switchNamirialEndpoint: (params: { useOnPremise: boolean }) => Promise<{
        success: boolean;
        isOnPremise?: boolean;
        baseUrl?: string;
        hasSaaS?: boolean;
        hasOnPremise?: boolean;
        error?: string;
      }>;
      saveNamirialEndpointConfig: (params: { useOnPremise: boolean }) => Promise<{
        success: boolean;
        error?: string;
      }>;

      onProgress: (callback: (progress: {
        completed: number;
        failed: number;
        total: number;
        currentPatient: string | null;
      }) => void) => void;
      onReportCompleted: (callback: (result: {
        examinationId: number;
        digitalReportId: string;
        success: boolean;
        error?: string;
      }) => void) => void;
      onCompleted: (callback: (result: {
        total: number;
        successful: number;
        failed: number;
      }) => void) => void;
      removeAllListeners: () => void;
    },
    wpfEditor: {
      start: () => Promise<boolean>;
      attach: (params: { sessionId: string }) => Promise<{
        state: 'stopped' | 'starting' | 'ready_hidden' | 'ready_visible' | 'stopping' | 'faulted';
        isReady: boolean;
        isVisible: boolean;
        activeSessions: number;
        reason?: string;
      }>;
      detach: (params: { sessionId: string }) => Promise<{
        state: 'stopped' | 'starting' | 'ready_hidden' | 'ready_visible' | 'stopping' | 'faulted';
        isReady: boolean;
        isVisible: boolean;
        activeSessions: number;
        reason?: string;
      }>;
      getStatus: () => Promise<{
        state: 'stopped' | 'starting' | 'ready_hidden' | 'ready_visible' | 'stopping' | 'faulted';
        isReady: boolean;
        isVisible: boolean;
        activeSessions: number;
        reason?: string;
      }>;
      loadRtf: (rtfBase64: string) => Promise<boolean>;
      getRtf: () => Promise<string>;
      getPdf: () => Promise<string>;
      isDirty: () => Promise<boolean>;
      show: () => Promise<boolean>;
      hide: () => Promise<boolean>;
      setBounds: (bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
        viewportWidth?: number;
        viewportHeight?: number;
        viewportDpr?: number;
      }) => Promise<boolean>;
      isReady: () => Promise<boolean>;
      setParent: () => Promise<boolean>;
      insertText: (text: string) => Promise<boolean>;
      setZoom: (zoomPercent: number) => Promise<boolean>;
      focus: () => Promise<boolean>;
      stop: () => Promise<boolean>;
      onStatus: (callback: (status: {
        state: 'stopped' | 'starting' | 'ready_hidden' | 'ready_visible' | 'stopping' | 'faulted';
        isReady: boolean;
        isVisible: boolean;
        activeSessions: number;
        reason?: string;
      }) => void) => void;
      removeStatusListeners: () => void;
    },
    speechToText: {
      getStatus: () => Promise<{
        enabled: boolean;
        binaryAvailable: boolean;
        modelDownloaded: boolean;
        modelName?: string;
        language?: string;
        error?: string;
      }>;
      downloadModel: () => Promise<{ success: boolean; error?: string }>;
      transcribe: (audioBuffer: ArrayBuffer) => Promise<{
        success: boolean;
        text?: string;
        error?: string;
        durationMs?: number;
      }>;
      onDownloadProgress: (callback: (progress: {
        percent: number;
        downloadedBytes: number;
        totalBytes: number;
      }) => void) => void;
      removeDownloadProgressListener: () => void;
    }
  }
}

export {
  Settings,
  CompanyFooterSettings,
  CompanyUISettings,
  EmergencyWorkaround,
  RemoteSignProviderConfig,
  RemoteSignConfig,
  SpeechToTextConfig
};
