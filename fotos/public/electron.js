const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const os = require("os");
const FtpSrv = require("ftp-srv");
const chokidar = require("chokidar");
const crypto = require("crypto");
const fs = require("fs").promises;
const fetch = require("node-fetch");
const winston = require("winston");
const { v4: uuidv4 } = require("uuid");
const debounce = require("lodash.debounce");
const cloudinary = require("cloudinary").v2;
const net = require("net");

require("dotenv").config();

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { error: error.message, stack: error.stack });
});
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection", { reason: reason.message || reason, promise });
});

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "496438207267-5sm1joa903t9k6ddgv5ulaigq8qvql46.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "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";
const REDIRECT_URI = process.env.REDIRECT_URI || "http://localhost:3000/api/auth/callback/google";
const SERVER_URL = process.env.SERVER_URL || "https://backend-google-three.vercel.app";
const FTP_PORT = parseInt(process.env.FTP_PORT, 10) || 2121;
const FTP_PASV_RANGE = process.env.FTP_PASV_RANGE || "8000-9000";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dxfujspwu",
  api_key: process.env.CLOUDINARY_API_KEY || "575875917966656",
  api_secret: process.env.CLOUDINARY_API_SECRET || "_MvreXnhQZ_1FyRyL75Fnuyt6u0"
});

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "electron.log" }),
    new winston.transports.Console()
  ]
});

let mainWindow;
let ftpServer;
let authWindow = null;
const userCredentials = new Map();
const directories = new Map();
const albumIds = new Map();
const processedFiles = new Set();
const watchers = new Map();

const DEFAULT_FTP_PASSWORD = "xy12z";

const passwordFilePath = path.join(app.getPath("userData"), "ftpPassword.json");

let ftpPassword = DEFAULT_FTP_PASSWORD;
const loadFtpPassword = async () => {
  try {
    const data = await fs.readFile(passwordFilePath, "utf8");
    const parsed = JSON.parse(data);
    if (parsed.password && /^[a-z0-9]{5}$/.test(parsed.password)) {
      ftpPassword = parsed.password;
      logger.info("Loaded FTP password from file", { password: ftpPassword });
    } else {
      logger.warn("Invalid password in file, using default");
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.info("Password file not found, initializing with default");
      await saveFtpPassword(DEFAULT_FTP_PASSWORD);
    } else {
      logger.error("Failed to load FTP password", { error: error.message });
    }
  }
};

const saveFtpPassword = async (password) => {
  try {
    await fs.writeFile(passwordFilePath, JSON.stringify({ password }, null, 2));
    logger.info("Saved FTP password to file", { password });
  } catch (error) {
    logger.error("Failed to save FTP password", { error: error.message });
  }
};

const isPortInUse = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      }
    });
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "0.0.0.0");
  });
};

const findAvailablePort = async (startPort) => {
  let port = startPort;
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      return port;
    }
    logger.warn(`Port ${port} is in use, trying next port`);
    port++;
  }
  throw new Error(`No available ports found between ${startPort} and ${startPort + maxAttempts - 1}`);
};

function createWindow() {
  mainWindow = new BrowserWindow({
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.maximize();

  const startUrl = `file://${path.join(__dirname, "../dist/index.html")}`;
  console.log(startUrl);

  mainWindow.loadURL(startUrl).catch((err) => {
    logger.error("Failed to load URL", { error: err.message });
  });

  mainWindow.webContents.openDevTools({ mode: "detach" });

  mainWindow.on("close", () => {
    mainWindow = null;
    if (authWindow) {
      authWindow.destroy();
      authWindow = null;
    }
    notifyRendererToClearCredentials();
    watchers.forEach((watcher) => watcher.close());
    watchers.clear();
  });
}

const generatePassword = () => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const allChars = letters + numbers;
  let password = "";

  password += letters[Math.floor(Math.random() * letters.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];

  for (let i = 0; i < 3; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  password = password.split("").sort(() => Math.random() - 0.5).join("");
  return password;
};

async function startFtpServer(username, directory, albumId, token, port = FTP_PORT) {
  const normalizedUsername = username.replace(/\s+/g, "");
  if (!normalizedUsername || !directory || !albumId || !token) {
    logger.error("Missing parameters for FTP server", { username: normalizedUsername, directory, albumId });
    return { error: "Username, directory, album ID, and token are required" };
  }

  const absoluteDir = path.resolve(directory);
  try {
    const stats = await fs.stat(absoluteDir);
    if (!stats.isDirectory()) {
      logger.error("Selected path is not a directory", { directory });
      return { error: "Selected path is not a directory" };
    }
  } catch (error) {
    logger.error("Directory inaccessible", { directory, error: error.message });
    return { error: "Directory does not exist or is inaccessible" };
  }

  const password = ftpPassword;
  userCredentials.set(normalizedUsername, { password });
  directories.set(normalizedUsername, absoluteDir);
  albumIds.set(normalizedUsername, albumId);

  logger.info("Stored credentials", { username: normalizedUsername, password });

  const interfaces = os.networkInterfaces();
  const address = Object.values(interfaces)
    .flat()
    .filter((iface) => iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address)[0] || "localhost";
  const host = address;

  let ftpPort = port;

  try {
    ftpPort = await findAvailablePort(port);
    logger.info(`Selected FTP port: ${ftpPort}`);
  } catch (error) {
    logger.error("Failed to find available port for FTP", { error: error.message });
    return { error: "Failed to find available port for FTP server" };
  }

  if (ftpServer && !ftpServer.closed) {
    const existingCreds = userCredentials.get(normalizedUsername);
    if (existingCreds && directories.get(normalizedUsername) === absoluteDir && albumIds.get(normalizedUsername) === albumId) {
      logger.info("FTP server already running with matching credentials", { username: normalizedUsername, host, ftpPort });
      const credentialsToSave = { host, username: normalizedUsername, password, port: ftpPort, mode: "Passive" };
      await mainWindow.webContents.executeJavaScript(`localStorage.setItem("ftpCredentials", ${JSON.stringify(JSON.stringify(credentialsToSave))})`);
      return credentialsToSave;
    }
  }

  if (ftpServer) {
    await ftpServer.close();
    ftpServer = null;
    watchers.forEach((watcher) => watcher.close());
    watchers.clear();
    logger.info("Closed existing FTP server to start new one");
  }

  ftpServer = new FtpSrv({
    url: `ftp://0.0.0.0:${ftpPort}`,
    anonymous: false,
    pasv_range: FTP_PASV_RANGE,
    pasv_url: host,
    greeting: ["Welcome to FTP server"]
  });

  ftpServer.on("login", ({ connection, username, password }, resolve, reject) => {
    logger.info("FTP login attempt", { username });
    const normalizedLoginUsername = username.replace(/\s+/g, "");
    const user = userCredentials.get(normalizedLoginUsername);
    if (user && user.password === password) {
      resolve({ root: directories.get(normalizedLoginUsername) });
      logger.info("FTP login successful", { username: normalizedLoginUsername, root: directories.get(normalizedLoginUsername) });
    } else {
      logger.error("FTP login failed: Invalid credentials", {
        username: normalizedLoginUsername,
        expected: user?.password,
        received: password
      });
      reject(new Error("Invalid credentials"));
    }
  });

  ftpServer.on("stor", ({ connection, filename }, resolve) => {
    logger.info("FTP file upload", { filename, username: connection.username });
    resolve();
  });

  try {
    await ftpServer.listen();
    logger.info(`FTP Server running on ftp://${host}:${ftpPort}`);

    const watcher = chokidar.watch(absoluteDir, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      }
    });

    watchers.set(username, watcher);

    const retry = async (fn, retries = 3, baseDelay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (error) {
          logger.warn(`Attempt ${i + 1} failed`, {});
          if (i === retries - 1) throw error;
          const delay = baseDelay * Math.pow(2, i);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    };

    const isImageFile = async (filePath) => {
      try {
        const buffer = await fs.readFile(filePath, { encoding: null, flag: "r" });
        const magicNumbers = {
          jpg: ["ffd8ff"],
          png: ["89504e47"],
          gif: ["47494638"],
          webp: ["52494646"],
          tiff: ["49492a00", "4d4d002a"],
          bmp: ["424d"],
          cr2: ["49492a00"],
          cr3: ["66747970637278"],
          nef: ["4d4d002a"],
          arw: ["49492a00", "4d4d002a"]
        };
        const firstBytes = buffer.slice(0, 8).toString("hex").toLowerCase();
        return Object.values(magicNumbers).some(group =>
          group.some(magic => firstBytes.startsWith(magic))
        );
      } catch (error) {
        logger.error("Failed to validate file as image", { filePath, error: error.message });
        return false;
      }
    };

    const handleFileAdd = debounce(async (filePath) => {
      const fileName = path.basename(filePath);
      logger.info("Chokidar detected new file", { filePath });

      if (processedFiles.has(filePath)) {
        logger.info("File already processed", { filePath });
        return;
      }

      processedFiles.add(filePath);
      setTimeout(() => processedFiles.delete(filePath), 10000);

      mainWindow.webContents.send("image-stream", { action: "pending", filePath });
      logger.info("Notified frontend of pending file", { filePath });

      try {
        await fs.access(filePath, fs.constants.R_OK);
        logger.info("File accessible", { filePath });
      } catch (error) {
        logger.error("File not accessible", { filePath, error: error.message });
        mainWindow.webContents.send("image-stream", { action: "error", error: `File not accessible: ${fileName}` });
        return;
      }

      const isImage = await isImageFile(filePath);
      if (!isImage) {
        logger.error("File is not a recognized image", { filePath });
        mainWindow.webContents.send("image-stream", { action: "error", error: `Not an image: ${fileName}` });
        return;
      }

      const fileUrl = `file://${filePath.replace(/\\/g, "/")}`;
      logger.info("Sending local file URL to frontend", { fileUrl });

      mainWindow.webContents.send("image-stream", {
        action: "add",
        imageUrl: fileUrl,
        filePath
      });
      logger.info("Sent local file to frontend via IPC", { fileUrl });
      try {
        const response = await retry(() =>
          fetch(`${SERVER_URL}/api/upload-photo`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ albumId, imageUrl: fileUrl })
          })
        );

        if (!response.ok) {
          const errorData = await response.json();
          logger.error("Failed to save photo to database", {
            imageUrl: fileUrl,
            albumId,
            status: response.status,
            error: errorData.error || "Unknown error"
          });
          mainWindow.webContents.send("image-stream", { action: "error", error: `Database save failed: ${fileName}` });
          throw new Error(errorData.error || "Failed to save photo to database");
        }

        logger.info("Photo saved to database", { imageUrl: fileUrl, albumId });
      } catch (error) {
        logger.error("Database save error", {
          filePath,
          error: error.message,
          stack: error.stack
        });
        mainWindow.webContents.send("image-stream", { action: "error", error: `Database save failed: ${fileName}` });
      }
    }, 1000);

    watcher.on("add", handleFileAdd);
    watcher.on("error", (error) => {
      logger.error("Chokidar error", { error: error.message });
    });

    logger.info("Returning FTP connection details", { host, username, password, ftpPort });
    const credentialsToSave = { host, username: normalizedUsername, password, port: ftpPort, mode: "Passive" };
    await mainWindow.webContents.executeJavaScript(`localStorage.setItem("ftpCredentials", ${JSON.stringify(JSON.stringify(credentialsToSave))})`);
    return credentialsToSave;
  } catch (error) {
    logger.error("FTP Server failed to start", { error: error.message });
    if (ftpServer) {
      ftpServer.close();
      ftpServer = null;
    }
    return { error: "Failed to start FTP server: " + error.message };
  }
}

ipcMain.handle("get-ftp-credentials", async () => {
  const credentials = Array.from(userCredentials.entries()).map(
    ([username, { password }]) => {
      const normalizedUsername = username.replace(/\s+/g, "");
      const directory = directories.get(normalizedUsername);
      const albumId = albumIds.get(normalizedUsername);
      const interfaces = os.networkInterfaces();
      const address = Object.values(interfaces)
        .flat()
        .filter((iface) => iface.family === "IPv4" && !iface.internal)
        .map((iface) => iface.address);
      const host = address[0] || "localhost";
      const port = FTP_PORT;
      if (!ftpServer || ftpServer.closed) {
        return {};
      }
      return {
        username: normalizedUsername,
        password,
        directory,
        albumId,
        host,
        port,
        mode: "Passive"
      };
    }
  ).filter(cred => Object.keys(cred).length > 0);

  logger.info("Returning stored credentials", { credentials });
  return credentials;
});

ipcMain.handle("check-ftp-status", async () => {
  logger.info("Checking FTP server status");
  if (ftpServer && !ftpServer.closed) {
    const credentials = Array.from(userCredentials.entries()).map(
      ([username, { password }]) => {
        const normalizedUsername = username.replace(/\s+/g, "");
        const directory = directories.get(normalizedUsername);
        const albumId = albumIds.get(normalizedUsername);
        const interfaces = os.networkInterfaces();
        const address = Object.values(interfaces)
          .flat()
          .filter((iface) => iface.family === "IPv4" && !iface.internal)
          .map((iface) => iface.address);
        const host = address[0] || "localhost";
        const port = FTP_PORT;
        return {
          username: normalizedUsername,
          password,
          directory,
          albumId,
          host,
          port,
          mode: "Passive"
        };
      }
    );
    logger.info("FTP server is running", { credentials });
    return { isRunning: true, credentials };
  } else {
    logger.info("FTP server is not running");
    return { isRunning: false, credentials: [] };
  }
});

ipcMain.handle("google-login", async () => {
  logger.info("Starting Google OAuth flow");

  if (authWindow) {
    logger.warn("Authentication window already open");
    throw new Error("An authentication window is already open");
  }

  return new Promise((resolve, reject) => {
    try {
      authWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        parent: mainWindow,
        modal: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      });

      if (!authWindow.webContents) {
        logger.error("authWindow.webContents is undefined");
        authWindow.destroy();
        authWindow = null;
        reject(new Error("Failed to initialize auth window"));
        return;
      }

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
        `response_type=code&` +
        `scope=email profile&` +
        `access_type=offline&` +
        `prompt=consent`;

      logger.info("Loading auth URL", { url: authUrl });
      authWindow.loadURL(authUrl).catch((err) => {
        logger.error("Failed to load auth URL", { error: err.message });
        authWindow.destroy();
        authWindow = null;
        reject(new Error("Failed to load authentication page"));
      });

      authWindow.once("ready-to-show", () => {
        logger.info("Auth window ready to show");
        authWindow.show();
      });

      const timeout = setTimeout(() => {
        logger.warn("Google OAuth flow timed out");
        if (authWindow) {
          authWindow.destroy();
          authWindow = null;
        }
        reject(new Error("Authentication timed out"));
      }, 120000);

      const onRedirect = (event, url) => {
        logger.info("Auth window will-redirect", { url });
        if (url.startsWith(REDIRECT_URI)) {
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get("code");
          clearTimeout(timeout);
          if (code) {
            logger.info("Authorization code received", { code: code.slice(0, 10) + "..." });
            authWindow.webContents.removeListener("will-redirect", onRedirect);
            resolve(code);
            setTimeout(() => {
              if (authWindow) {
                authWindow.destroy();
                authWindow = null;
              }
            }, 100);
          } else {
            logger.error("No authorization code received");
            authWindow.webContents.removeListener("will-redirect", onRedirect);
            authWindow.destroy();
            authWindow = null;
            reject(new Error("No authorization code received"));
          }
        }
      };
      authWindow.webContents.on("will-redirect", onRedirect);

      authWindow.webContents.once("did-fail-load", (event, errorCode, errorDescription) => {
        logger.error("Auth page failed to load", { errorCode, errorDescription });
        clearTimeout(timeout);
        authWindow.webContents.removeListener("will-redirect", onRedirect);
        authWindow.destroy();
        authWindow = null;
        reject(new Error(`Failed to load auth page: ${errorDescription}`));
      });

      authWindow.on("closed", () => {
        logger.info("Auth window closed");
        clearTimeout(timeout);
        authWindow.webContents.removeListener("will-redirect", onRedirect);
        authWindow = null;
        reject(new Error("Authentication window closed"));
      });
    } catch (error) {
      logger.error("Error in google-login handler", { error: error.message });
      if (authWindow) {
        authWindow.destroy();
        authWindow = null;
      }
      reject(error);
    }
  });
});

ipcMain.handle("exchange-auth-code", async (event, code) => {
  logger.info("Exchanging auth code");
  try {
    const retry = async (fn, retries = 3, baseDelay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (error) {
          logger.warn(`Attempt ${i + 1} failed`, { error: error.message });
          if (i === retries - 1) throw error;
          const delay = baseDelay * Math.pow(2, i);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    };

    const tokenResponse = await retry(() =>
      fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code"
        })
      })
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      logger.error("Failed to exchange auth code", { error: errorData.error_description });
      throw new Error(errorData.error_description || "Failed to exchange code");
    }

    const result = await tokenResponse.json();
    logger.info("Auth code exchanged successfully");
    return result;
  } catch (error) {
    logger.error("Error exchanging auth code", { error: error.message });
    throw error;
  }
});

ipcMain.handle("ping", () => {
  logger.info("Ping received");
  return "pong";
});

ipcMain.handle("dialog:selectFolder", async () => {
  logger.info("Opening folder selection dialog");
  try {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
    return result.canceled ? null : result.filePaths[0];
  } catch (error) {
    logger.error("Failed to select folder", { error: error.message });
    throw error;
  }
});

ipcMain.handle("start-ftp", async (event, { username, directory, albumId, token }) => {
  logger.info("Starting FTP server", { username, directory, albumId });
  return await startFtpServer(username, directory, albumId, token);
});

ipcMain.handle("reset-ftp-credentials", async () => {
  userCredentials.clear();
  directories.clear();
  albumIds.clear();
  processedFiles.clear();
  watchers.forEach((watcher) => watcher.close());
  watchers.clear();
  if (ftpServer) {
    await ftpServer.close();
    ftpServer = null;
  }
  logger.info("Credentials and servers reset");
  return { message: "Credentials reset successfully" };
});

ipcMain.handle("close-ftp", async () => {
  logger.info("Closing FTP server");
  if (ftpServer) {
    try {
      await ftpServer.close();
      ftpServer = null;
      watchers.forEach((watcher) => watcher.close());
      watchers.clear();
      logger.info("FTP server closed successfully");
      return { message: "FTP server closed successfully" };
    } catch (error) {
      logger.error("Failed to close FTP server", { error: error.message });
      throw new Error("Failed to close FTP server: " + error.message);
    }
  } else {
    logger.info("No FTP server running");
    return { message: "No FTP server running" };
  }
});

ipcMain.handle("regenerate-ftp-password", async (event, username) => {
  logger.info("Regenerating FTP password", { username });
  const normalizedUsername = username.replace(/\s+/g, "");
  const newPassword = generatePassword();
  ftpPassword = newPassword;
  await saveFtpPassword(newPassword);
  userCredentials.set(normalizedUsername, { password: newPassword });
  logger.info("New password generated and saved", { username: normalizedUsername, password: newPassword });

  const savedCredentials = await mainWindow.webContents.executeJavaScript('localStorage.getItem("ftpCredentials")');
  if (savedCredentials) {
    const creds = JSON.parse(savedCredentials);
    if (creds.username === normalizedUsername) {
      creds.password = newPassword;
      await mainWindow.webContents.executeJavaScript(`localStorage.setItem("ftpCredentials", ${JSON.stringify(JSON.stringify(creds))})`);
    }
  }

  return { password: newPassword };
});

ipcMain.handle("test-ftp-credentials", async (event, { username, password }) => {
  logger.info("Testing credentials", { username });
  const normalizedUsername = username.replace(/\s+/g, "");
  const user = userCredentials.get(normalizedUsername);
  if (user && user.password === password) {
    logger.info("Test credentials successful", { username: normalizedUsername });
    return { valid: true };
  } else {
    logger.error("Test credentials failed", { username: normalizedUsername, expected: user?.password });
    return { valid: false, expected: user?.password };
  }
});

ipcMain.handle("upload-image", async (event, { base64Image, albumId, token }) => {
  logger.info("Processing image upload", { albumId, dataType: "base64" });

  if (!base64Image || !albumId || !token) {
    logger.error("Missing required parameters", { base64Image: !!base64Image, albumId, token });
    return { error: "Invalid image data, album ID, or token" };
  }

  try {
    const retry = async (fn, retries = 3, baseDelay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (error) {
          logger.warn(`Attempt ${i + 1} failed`, { error: error.message });
          if (i === retries - 1) throw error;
          const delay = baseDelay * Math.pow(2, i);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    };

    let base64String = base64Image;
    if (base64String.startsWith("data:image/")) {
      base64String = base64String.split(",")[1];
    }

    if (!/^[A-Za-z0-9+/=]+$/.test(base64String)) {
      logger.error("Invalid base64 data");
      throw new Error("Invalid base64 image data");
    }

    const publicId = `image-${crypto.randomUUID()}`;
    const uploadResult = await retry(() =>
      cloudinary.uploader.upload(`data:image/jpeg;base64,${base64String}`, {
        folder: "albums",
        resource_type: "image",
        public_id: publicId
      })
    );

    const cloudinaryUrl = uploadResult.secure_url;
    logger.info("Image uploaded to Cloudinary", { publicId, cloudinaryUrl });

    mainWindow.webContents.send("image-stream", { action: "upload", data: cloudinaryUrl });

    const response = await retry(() =>
      fetch(`${SERVER_URL}/api/upload-photo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ albumId, imageUrl: cloudinaryUrl })
      })
    );

    if (!response.ok) {
      const errorData = await response.json();
      logger.error("Failed to save photo to database", {
        cloudinaryUrl,
        albumId,
        status: response.status,
        error: errorData.error || "Unknown error"
      });
      throw new Error(errorData.error || "Failed to save photo to database");
    }

    logger.info("Photo saved to database", { cloudinaryUrl, albumId });
    return { url: cloudinaryUrl };
  } catch (error) {
    logger.error("Image upload error", { error: error.message });
    return { error: error.message };
  }
});

ipcMain.handle("save-collections", async (event, collections) => {
  logger.info("Saving collections");
  try {
    const dataPath = path.join(app.getPath("userData"), "collections.json");
    await fs.writeFile(dataPath, JSON.stringify(collections, null, 2));
    logger.info("Collections saved successfully", { dataPath });
    return { success: true };
  } catch (error) {
    logger.error("Failed to save collections", { error: error.message });
    throw error;
  }
});

ipcMain.handle("load-collections", async () => {
  logger.info("Loading collections");
  try {
    const dataPath = path.join(app.getPath("userData"), "collections.json");
    const data = await fs.readFile(dataPath, "utf8");
    logger.info("Collections loaded successfully", { dataPath });
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.info("Collections file not found", { dataPath });
      return null;
    }
    logger.error("Failed to load collections", { error: error.message });
    throw error;
  }
});

ipcMain.handle("save-data", async (event, { type, data }) => {
  logger.info("Saving data", { type });
  try {
    const dataPath = path.join(app.getPath("userData"), `${type}.json`);
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
    logger.info("Data saved successfully", { type, dataPath });
    return { success: true };
  } catch (error) {
    logger.error("Failed to save data", { type, error: error.message });
    throw error;
  }
});

ipcMain.handle("load-data", async (event, type) => {
  logger.info("Loading data", { type });
  try {
    const dataPath = path.join(app.getPath("userData"), `${type}.json`);
    const data = await fs.readFile(dataPath, "utf8");
    logger.info("Data loaded successfully", { type, dataPath });
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.info("Data file not found", { type });
      return null;
    }
    logger.error("Failed to load data", { type, error: error.message });
    throw error;
  }
});

ipcMain.handle("node-version", async () => {
  logger.info("Node version requested");
  return process.version;
});

app.whenReady().then(async () => {
  await loadFtpPassword();
  logger.info("Electron app starting");
  createWindow();
  Menu.setApplicationMenu(null);
});

const notifyRendererToClearCredentials = () => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    win.webContents.send("clear-ftp-credentials", { message: "App is closing, clear FTP credentials and localStorage" });
    logger.info("Notified renderer to clear FTP credentials and localStorage");
  });
};

app.on("window-all-closed", async () => {
  logger.info("All windows closed");
  if (process.platform !== "darwin") {
    logger.info("Quitting app, closing FTP server");
    if (ftpServer) {
      try {
        await ftpServer.close();
        logger.info("FTP server closed successfully");
        ftpServer = null;
      } catch (error) {
        logger.error("Failed to close FTP server", { error: error.message });
      }
    }
    notifyRendererToClearCredentials();
    watchers.forEach((watcher) => watcher.close());
    watchers.clear();
    app.quit();
  }
});

app.on("before-quit", async () => {
  logger.info("App is quitting, ensuring FTP server is closed");
  if (ftpServer) {
    try {
      await ftpServer.close();
      logger.info("FTP server shut down before quit");
      ftpServer = null;
    } catch (error) {
      logger.error("Failed to close FTP server", { error: error.message });
    }
  }
  notifyRendererToClearCredentials();
  watchers.forEach((watcher) => watcher.close());
  watchers.clear();
});

ipcMain.on("exit-app", () => {
  logger.info("Received exit-app message from renderer, closing app");
  if (mainWindow) {
    mainWindow.close();
  }
});