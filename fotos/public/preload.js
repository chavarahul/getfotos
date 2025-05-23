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
  closeFtp: () => ipcRenderer.invoke("close-ftp"),
  onImageStream: (callback) => {
    console.log("Registering image-stream listener, total:", imageStreamListeners.size + 1);
    imageStreamListeners.add(callback);
    const handler = (event, data) => {
      console.log("Received image-stream event:", JSON.stringify(data));
      imageStreamListeners.forEach((listener) => {
        try {
          listener(data);
        } catch (error) {
          console.error("Error in image-stream listener:", error.message);
        }
      });
    };
    ipcRenderer.on("image-stream", handler);
    return () => {
      imageStreamListeners.delete(callback);
      ipcRenderer.removeListener("image-stream", handler);
      console.log("Removed image-stream listener, total:", imageStreamListeners.size);
    };
  },
  removeImageStreamListener: (callback) => {
    imageStreamListeners.delete(callback);
    console.log("Removed image-stream listener via removeImageStreamListener, total:", imageStreamListeners.size);
  },
  onClearFtpCredentials: (callback) => ipcRenderer.on("clear-ftp-credentials", (event, data) => callback(data)),
  removeClearFtpCredentialsListener: (callback) => ipcRenderer.removeListener("clear-ftp-credentials", callback),
});