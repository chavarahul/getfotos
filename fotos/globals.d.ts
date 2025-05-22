interface ElectronAPI {
  saveCollections: (collections: any) => Promise<{ success: boolean; error?: string }>;
  loadCollections: () => Promise<any[]>;
  saveData: (type: string, data: any) => Promise<{ success: boolean; error?: string }>;
  loadData: (type: string) => Promise<any[]>;
  googleLogin: () => Promise<string>;
  exchangeAuthCode: (code: string) => Promise<{ id_token: string }>;
  nodeVersion: (msg: string) => Promise<string>;
  selectFolder: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}