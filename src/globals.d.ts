// src/globals.d.ts

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
}

interface CompanyFooterSettings {
  footerImageWidth: number;
  footerImageHeight: number;
  blankFooterHeight: number;
  yPosFooterImage: number;
  footerImageXPositionOffset: number;
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
    }
  }
}

export { Settings, CompanyFooterSettings, CompanyUISettings, EmergencyWorkaround };
