const { contextBridge, ipcRenderer } = require("electron");

const imageStreamListeners = new Set();

contextBridge.exposeInMainWorld("electronAPI", {
  saveCollections: (collections) => ipcRenderer.invoke("save-collections", collections),
  loadCollections: () => ipcRenderer.invoke("load-collections"),
  saveData: (type, data) => ipcRenderer.invoke("save-data", type, data),
  loadData: (type) => ipcRenderer.invoke("load-data", type),
  googleLogin: () => ipcRenderer.invoke("google-login"),
  exchangeAuthCode: (code) => ipcRenderer.invoke("exchange-auth-code", code),
  nodeVersion: (msg) => ipcRenderer.invoke("node-version", msg),
  selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
  ping: () => ipcRenderer.invoke("ping"),
  startFtp: (config) => ipcRenderer.invoke("start-ftp", config),
  getFtpCredentials: () => ipcRenderer.invoke("get-ftp-credentials"),
  resetFtpCredentials: () => ipcRenderer.invoke("reset-ftp-credentials"),
  testFtpCredentials: (credentials) => ipcRenderer.invoke("test-ftp-credentials", credentials),
  regenerateFtpPassword: (username) => ipcRenderer.invoke("regenerate-ftp-password", username),
  onImageStream: (callback) => {
    imageStreamListeners.add(callback);
    ipcRenderer.on("image-stream", (event, data) => {
      imageStreamListeners.forEach((listener) => listener(data));
    });
  },
  removeImageStreamListener: (callback) => {
    imageStreamListeners.delete(callback);
  },
  closeFtp: () => ipcRenderer.invoke("close-ftp"),
  onClearFtpCredentials: (callback) => ipcRenderer.on("clear-ftp-credentials", (event, data) => callback(data)),
  removeClearFtpCredentialsListener: (callback) => ipcRenderer.removeListener("clear-ftp-credentials", callback),
});
