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

interface CompanyUISettings {
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

export { Settings, CompanyFooterSettings, CompanyUISettings };
