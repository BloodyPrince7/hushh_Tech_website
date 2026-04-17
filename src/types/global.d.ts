// Global type declarations for Google Analytics
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
    __HUSHH_VERSION__?: {
      version?: string;
      built?: string;
      commit?: string;
    };
  }
}

export {}; 
