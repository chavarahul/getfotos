const { app, BrowserWindow, ipcMain, dialog, Menu, net: internet } = require("electron");
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
const axios = require('axios')
require("dotenv").config();

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { error: error.message, stack: error.stack });
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection", { reason: reason.message || reason, promise });
});

const GOOGLE_CLIENT_ID = "496438207267-5sm1joa903t9k6ddgv5ulaigq8qvql46.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";

const REDIRECT_URI = "http://localhost:3000/api/auth/callback/google";
const SERVER_URL = "https://backend-google-three.vercel.app";
const FTP_PORT = 2121;
const FTP_PASV_RANGE = "8000-9000";

cloudinary.config({
  cloud_name: "dxfujspwu",
  api_key: "575875917966656",
  api_secret: "_MvreXnhQZ_1FyRyL75Fnuyt6u0",
});


const axiosInstance = axios.create({
  // baseURL: "https://backend-google-three.vercel.app",
  baseURL: " http://localhost:4000",

});

axiosInstance.interceptors.request.use(async (config) => {
  const user = await userData();
  const token = user.token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});


const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: "electron.log" }),
    new winston.transports.Console(),
  ],
});

let mainWindow;
let ftpServer;
let authWindow = null;
const userCredentials = new Map();
const directories = new Map();
const albumIds = new Map();
const albumNames = new Map();
const processedFiles = new Set();
const watchers = new Map();

const DEFAULT_FTP_PASSWORD = "xy12z";

const passwordFilePath = path.join(app.getPath("userData"), "ftpPassword.json");

let ftpPassword = DEFAULT_FTP_PASSWORD;
let photosData = {};


const DATA_DIR = path.join(app.getPath('userData'), 'data');
const photosFilePath = path.join(DATA_DIR, "photos.json");
const ALBUM_FILE_PATH = path.join(DATA_DIR, 'album.json');
const SYNC_FILE_PATH = path.join(DATA_DIR, "syncQueue.json");
const IMAGE_DIR_PATH = path.join(DATA_DIR, 'images');

async function ensureAlbumFileStructure() {
  console.log('Ensuring directory structure for:', DATA_DIR);

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(IMAGE_DIR_PATH, { recursive: true });

    try {
      const albumFileStat = await fs.stat(ALBUM_FILE_PATH);
      if (!albumFileStat.isFile()) {
        logger.info(`Removing non-file at ${ALBUM_FILE_PATH} to create file`);
        await fs.rm(ALBUM_FILE_PATH, { recursive: true, force: true });
        await fs.writeFile(ALBUM_FILE_PATH, JSON.stringify([]), 'utf-8');
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        logger.info('Creating initial album.json at:', ALBUM_FILE_PATH);
        await fs.writeFile(ALBUM_FILE_PATH, JSON.stringify([]), 'utf-8');
      } else {
        logger.info('Error checking album.json:', err);
        throw err;
      }
    }
  } catch (err) {
    logger.info('Error ensuring album file structure:', err);
    throw err;
  }
}

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
    await fs.writeFile(passwordFilePath, JSON.stringify({ password }));
    logger.info("Saved FTP password to file", { password });
  } catch (error) {
    logger.error("Failed to save FTP password", { error: error.message });
  }
};

const loadPhotosData = async () => {
  try {
    const data = await fs.readFile(photosFilePath, "utf8");
    photosData = JSON.parse(data);
    logger.info("Loaded photos data from file", { file: photosFilePath });
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.info("Photos file not found, initializing empty");
      photosData = {};
      await savePhotosData();
    } else {
      logger.error("Failed to load photos data", { error: error.message });
    }
  }
};

const savePhotosData = async () => {
  try {
    await fs.writeFile(photosFilePath, JSON.stringify(photosData, null, 2));
    logger.info("Saved photos data to file", { file: photosFilePath });
  } catch (error) {
    logger.error("Failed to save photos data", { error: error.message });
  }
};

const isPortInUse = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
};

const findAvailablePort = async (startPort) => {
  let port = startPort;
  const maxAttempts = 100;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      return port;
    }
    port++;
    attempts++;
  }

  throw new Error(`No available ports found after ${maxAttempts} attempts`);
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // const startUrl = "http://localhost:3000";
  //   process.env.NODE_ENV === "development"
  //     ? "http://localhost:3000"
  //     : 

  const startUrl = `${path.join(__dirname, "../dist/index.html")}`;

  mainWindow.loadURL(startUrl);
  mainWindow.webContents.openDevTools({ mode: "detach" });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  logger.info("Main window created", { startUrl });
};

const generatePassword = () => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";
  for (let i = 0; i < 5; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

async function startFtpServer(username, directory, albumId, albumName, token, port = FTP_PORT) {
  const normalizedUsername = username.replace(/\s+/g, "");
  if (!normalizedUsername || !directory || !albumId || !albumName || !token) {
    logger.error("Missing parameters for FTP server", {
      username: normalizedUsername,
      directory,
      albumId,
      albumName,
    });
    return { error: "Username, directory, album ID, album name, and token are required" };
  }

  logger.info("Starting FTP server with parameters", { username: normalizedUsername, directory, albumId, albumName });

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
  albumNames.set(normalizedUsername, albumName);

  logger.info("Stored credentials", {
    username: normalizedUsername,
    password,
    albumName,
    source: "User-selected album",
  });

  const interfaces = os.networkInterfaces();
  const address =
    Object.values(interfaces)
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
    if (
      existingCreds &&
      directories.get(normalizedUsername) === absoluteDir &&
      albumIds.get(normalizedUsername) === albumId &&
      albumNames.get(normalizedUsername) === albumName
    ) {
      logger.info("FTP server already running with matching credentials", {
        username: normalizedUsername,
        host,
        ftpPort,
      });
      const credentialsToSave = {
        host,
        username: normalizedUsername,
        password,
        port: ftpPort,
        mode: "Passive",
      };
      await mainWindow.webContents.executeJavaScript(
        `localStorage.setItem("ftpCredentials", ${JSON.stringify(JSON.stringify(credentialsToSave))})`
      );
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
    greeting: ["Welcome to FTP server"],
  });

  ftpServer.on("login", ({ connection, username, password }, resolve, reject) => {
    logger.info("FTP login attempt", { username });
    const normalizedLoginUsername = username.replace(/\s+/g, "");
    const user = userCredentials.get(normalizedLoginUsername);
    if (user && user.password === password) {
      resolve({ root: directories.get(normalizedLoginUsername) });
      logger.info("FTP login successful", {
        username: normalizedLoginUsername,
        root: directories.get(normalizedLoginUsername),
      });
    } else {
      logger.error("FTP login failed: Invalid credentials", {
        username: normalizedLoginUsername,
        expected: user?.password,
        received: password,
      });
      reject(new Error("Invalid credentials"));
    }
  });

  ftpServer.on("stor", ({ connection, filename }, resolve) => {
    logger.info("FTP file upload started", { filename, username: connection.username, directory: directories.get(connection.username) });
    resolve();
  });

  ftpServer.on("stor-complete", ({ connection, filename }) => {
    logger.info("FTP file upload completed", { filename, username: connection.username, directory: directories.get(connection.username) });
  });

  try {
    await ftpServer.listen();
    logger.info(`FTP Server running on ftp://${host}:${ftpPort}`);

    const watcher = chokidar.watch(absoluteDir, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 200,
      },
    });

    watchers.set(username, watcher);

    const retry = async (fn, retries = 3, baseDelay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (error) {
          logger.warn(`Attempt ${i + 1} failed`, { error: error.message });
          if (i === retries - 1) throw error;
          const delay = baseDelay * Math.pow(2, i);
          await new Promise((resolve) => setTimeout(resolve, delay));
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
          arw: ["49492a00", "4d4d002a"],
        };
        const firstBytes = buffer.slice(0, 8).toString("hex").toLowerCase();
        return Object.values(magicNumbers).some((group) =>
          group.some((magic) => firstBytes.startsWith(magic))
        );
      } catch (error) {
        logger.error("Failed to validate file as image", { filePath, error: error.message });
        return false;
      }
    };

    const handleFileAdd = debounce(async (filePath) => {
      const fileName = path.basename(filePath);
      logger.info("Chokidar detected new file", { filePath, fileName, albumName, directory: absoluteDir });

      if (processedFiles.has(filePath)) {
        logger.info("File already processed", { filePath });
        return;
      }

      processedFiles.add(filePath);
      setTimeout(() => processedFiles.delete(filePath), 10000);

      mainWindow.webContents.send("image-stream", { action: "pending", filePath });
      logger.info("Notified frontend of pending file", { filePath });

      const isImage = await isImageFile(filePath);
      if (!isImage) {
        logger.error("File is not a recognized image", { filePath });
        mainWindow.webContents.send("image-stream", {
          action: "error",
          error: `Not an image: ${fileName}`,
        });
        return;
      }

      const fileUrl = `file://${filePath.replace(/\\/g, "/")}`;
      const photoId = uuidv4();
      const createdAt = new Date().toISOString();
      logger.info("Processing photo for storage", { fileName, albumName, photoId, fileUrl });
      try {
        await loadPhotosData();
        if (!photosData[albumName]) {
          photosData[albumName] = [];
        }
        const user = await userData();
        
        const newPhoto = {
          id: photoId,
          albumName,
          userId: user.id,
          imageUrl: fileUrl,
          createdAt,
        };
        photosData.push(newPhoto);
        await savePhotosData();
        logger.info("Photo inserted into JSON storage", {
          photoId,
          albumName,
          fileUrl,
          source: "User-selected album",
          photosCount: photosData.length,
        });
        console.log("Current photosData after insert:", JSON.stringify(photosData, null, 2));
      } catch (error) {
        logger.error("Storage insertion error", {
          filePath,
          error: error.message,
          stack: error.stack,
        });
        mainWindow.webContents.send("image-stream", {
          action: "error",
          error: `Failed to store photo: ${fileName}`,
        });
        return;
      }
      if (!albumName || fileUrl.length > 255) {
        logger.error("Invalid storage input", {
          albumName,
          fileUrlLength: fileUrl.length,
        });
        mainWindow.webContents.send("image-stream", {
          action: "error",
          error: `Invalid data for ${fileName}`,
        });
        return;
      }


      mainWindow.webContents.send("image-stream", {
        action: "add",
        imageUrl: fileUrl,
        filePath,
        albumName,
      });
      logger.info("Sent image-stream to frontend", { fileUrl, albumName });

      //   try {
      //     const response = await retry(() =>
      //       fetch(`${SERVER_URL}/api/upload-photo`, {
      //         method: "POST",
      //         headers: {
      //           "Content-Type": "application/json",
      //           Authorization: `Bearer ${token}`,
      //         },
      //         body: JSON.stringify({ albumId, imageUrl: fileUrl }),
      //       })
      //     );

      //     if (!response.ok) {
      //       const errorData = await response.json();
      //       logger.error("Failed to save photo to database", {
      //         imageUrl: fileUrl,
      //         albumId,
      //         status: response.status,
      //         error: errorData.error || "Unknown error",
      //       });
      //     } else {
      //       logger.info("Photo saved to database", { imageUrl: fileUrl, albumId });
      //     }
      //   } catch (error) {
      //     logger.error("Server database save error", {
      //       filePath,
      //       error: error.message,
      //       stack: error.stack,
      //     });
      //   }
    }, 1000);

    watcher.on("add", handleFileAdd);
    watcher.on("error", (error) => {
      logger.error("Chokidar error", { error: error.message, directory: absoluteDir });
    });

    logger.info("Returning FTP connection details", { host, username, password, ftpPort });
    const credentialsToSave = {
      host,
      username: normalizedUsername,
      password,
      port: ftpPort,
      mode: "Passive",
    };
    await mainWindow.webContents.executeJavaScript(
      `localStorage.setItem("ftpCredentials", ${JSON.stringify(JSON.stringify(credentialsToSave))})`
    );
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

ipcMain.handle("fetch-photos", async (event, albumName) => {
  logger.info("Fetching photos from JSON storage", { albumName });
  try {
    await loadPhotosData();
    const photos = photosData[albumName] || [];
    logger.info("Photos fetched successfully", { albumName, count: photos.length });
    console.log("Photos data for fetch:", JSON.stringify(photosData, null, 2));
    return photos.map((photo) => ({
      id: photo.id,
      albumName: photo.albumName,
      url: photo.imageUrl,
      createdAt: photo.createdAt,
      caption: "",
    }));
  } catch (error) {
    logger.error("Error fetching photos", { albumName, error: error.message });
    throw error;
  }
});

ipcMain.handle("delete-photo", async (event, { photoId }) => {
  logger.info("Deleting photo from JSON storage", { photoId });
  try {
    await loadPhotosData();
    for (const albumName in photosData) {
      photosData[albumName] = photosData[albumName].filter((photo) => photo.id !== photoId);
    }
    await savePhotosData();
    logger.info("Photo deleted successfully", { photoId });
    return { success: true, changes: 1 };
  } catch (error) {
    logger.error("Error deleting photo", { photoId, error: error.message });
    throw error;
  }
});

ipcMain.handle("bulk-delete-photos", async (event, { photoIds }) => {
  logger.info("Bulk deleting photos from JSON storage", { photoIds });
  try {
    await loadPhotosData();
    for (const albumName in photosData) {
      photosData[albumName] = photosData[albumName].filter((photo) => !photoIds.includes(photo.id));
    }
    await savePhotosData();
    logger.info("Photos bulk deleted successfully", { photoIds });
    return { success: true, changes: photoIds.length };
  } catch (error) {
    logger.error("Error bulk deleting photos", { photoIds, error: error.message });
    throw error;
  }
});

ipcMain.handle("get-ftp-credentials", async () => {
  const credentials = Array.from(userCredentials.entries())
    .map(([username, { password }]) => {
      const normalizedUsername = username.replace(/\s+/g, "");
      const directory = directories.get(normalizedUsername);
      const albumId = albumIds.get(normalizedUsername);
      const albumName = albumNames.get(normalizedUsername);
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
        albumName,
        host,
        port,
        mode: "Passive",
      };
    })
    .filter((cred) => Object.keys(cred).length > 0);

  logger.info("Returning stored credentials", { credentials });
  return credentials;
});

ipcMain.handle("check-ftp-status", async () => {
  // logger.info("Checking FTP server status");
  if (ftpServer && !ftpServer.closed) {
    const credentials = Array.from(userCredentials.entries()).map(([username, { password }]) => {
      const normalizedUsername = username.replace(/\s+/g, "");
      const directory = directories.get(normalizedUsername);
      const albumId = albumIds.get(normalizedUsername);
      const albumName = albumNames.get(normalizedUsername);
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
        albumName,
        host,
        port,
        mode: "Passive",
      };
    });
    return { isRunning: true, credentials };
  } else {
    logger.info("FTP server is not running");
    return { isRunning: false, credentials: [] };
  }
});

ipcMain.handle("google-login", async () => {
  logger.info("Initiating Google login");
  const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=email%20profile`;

  authWindow = new BrowserWindow({
    width: 600,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  logger.info("Loading OAuth URL", { oauthUrl });
  authWindow.loadURL(oauthUrl);

  return new Promise((resolve) => {
    authWindow.webContents.on("will-redirect", (event, url) => {
      logger.info("Received redirect", { url });
      if (url.startsWith(REDIRECT_URI)) {
        const parsedUrl = new URL(url);
        const code = parsedUrl.searchParams.get("code");
        logger.info("Extracted auth code", { code });
        authWindow.close();
        authWindow = null;
        resolve(code);
      }
    });

    authWindow.on("closed", () => {
      logger.info("Auth window closed");
      authWindow = null;
      resolve({ error: "Authorization window closed" });
    });
  });
});

ipcMain.handle("exchange-auth-code", async (event, code) => {
  logger.info("Exchanging auth code", { code });
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": `Electron/${process.versions.electron} MyApp/1.0.0`,
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();
    if (data.error) {
      logger.error("Failed to exchange auth code", { error: data.error, description: data.error_description });
      return { error: data.error_description || "Failed to authenticate" };
    }

    logger.info("Auth token received", { id_token: data.id_token });

    return { id_token: data.id_token };
  } catch (error) {
    logger.error("Error during auth code exchange", { error: error.message, stack: error.stack });
    return { error: error.message };
  }
});

ipcMain.handle('save-user', async (_event, user) => {
  try {
    const filePath = path.join(app.getPath('userData'), 'data');
    const USER_FILE_PATH = path.join(filePath, 'user.json');
    await fs.mkdir(filePath, { recursive: true });
    await fs.writeFile(USER_FILE_PATH, JSON.stringify(user, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    console.error("Error saving user:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("load-user", async () => {
  try {
    const filePath = path.join(app.getPath('userData'), 'data');
    const USER_FILE_PATH = path.join(filePath, 'user.json');
    const data = await fs.readFile(USER_FILE_PATH, "utf-8");
    const user = JSON.parse(data);
    return { success: true, user };
  } catch (error) {
    console.error("Failed to load user:", error);
    return { success: false, error: error.message };
  }
});


async function appendToSyncQueue(entry) {
  try {
    let queue = [];
    try {
      const raw = await fs.readFile(SYNC_FILE_PATH, "utf-8");
      queue = raw.trim() ? JSON.parse(raw) : [];
    } catch (_) { }
    queue.push(entry);
    await fs.writeFile(SYNC_FILE_PATH, JSON.stringify(queue, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to append to sync queue", err);
  }
}

async function userData() {
  const filePath = path.join(app.getPath('userData'), 'data');
  const USER_FILE_PATH = path.join(filePath, 'user.json');
  const data = await fs.readFile(USER_FILE_PATH, "utf-8");
  const user = JSON.parse(data);
  return user;
}

ipcMain.handle("albums:create", async (event, album) => {
  const { name, date, image } = album;
  console.log("Creating new album", { album, ALBUM_FILE_PATH, IMAGE_DIR_PATH });

  try {
    await ensureAlbumFileStructure();
    let albums = [];

    try {
      const raw = await fs.readFile(ALBUM_FILE_PATH, "utf-8");
      albums = raw.trim() === "" ? [] : JSON.parse(raw);
    } catch (err) {
      if (err.code === "ENOENT") {
        console.log("Albums file not found, creating new one");
        await fs.writeFile(ALBUM_FILE_PATH, JSON.stringify([]), "utf-8");
      } else {
        throw err;
      }
    }

    const { nanoid } = await import("nanoid");
    const newId = nanoid();

    let imagePath = "";
    if (image?.base64 && image?.name) {
      const extension = path.extname(image.name);
      imagePath = path.join(IMAGE_DIR_PATH, `${newId}${extension}`);
      await fs.mkdir(IMAGE_DIR_PATH, { recursive: true });
      const base64Data = image.base64.replace(/^data:image\/\w+;base64,/, "");
      await fs.writeFile(imagePath, base64Data, "base64");
    }

    const user = await userData();
    if (!user) throw new Error("User not found");

    const newAlbum = { id: newId, userId: user.id, name, date, imagePath };
    albums.push(newAlbum);

    await fs.writeFile(ALBUM_FILE_PATH, JSON.stringify(albums, null, 2), "utf-8");
    await appendToSyncQueue({
      action: "create",
      album: newAlbum,
      imageBase64: image?.base64 || null,
    });


    return newAlbum;
  } catch (error) {
    console.error("Failed to create album", error);
    return { success: false, error: error.message };
  }
});

const isOnline = async () => {
  if (internet.isOnline()) {
    return true;
  }
  return false;
};

ipcMain.handle("albums:get", async () => {
  await ensureAlbumFileStructure();
  try {
    const online = await isOnline();
    if (online) {
      console.log("Online: fetching albums from cloud...");
      const cloudResponse = await axiosInstance.get("/api/albums");
      const cloudAlbums = cloudResponse.data;

      await fs.writeFile(ALBUM_FILE_PATH, JSON.stringify(cloudAlbums, null, 2), "utf-8");
      console.log("Local albums replaced with cloud albums.");
      return cloudAlbums;
    } else {
      console.log("Offline: loading albums from local...");
      const raw = await fs.readFile(ALBUM_FILE_PATH, "utf-8");
      return raw.trim() ? JSON.parse(raw) : [];
    }
  } catch (err) {
    console.error("Error getting albums:", err.message);
    return [];
  }
});

ipcMain.handle("albums:update", async (_, { id, name, date, image }) => {
  await ensureAlbumFileStructure();
  console.log("Updating album", { id, name, date, image });
  try {
    const raw = await fs.readFile(ALBUM_FILE_PATH, "utf-8");
    const albums = JSON.parse(raw);

    const index = albums.findIndex((a) => a.id === id);
    if (index === -1) {
      console.error("Album not found", { id });
      throw new Error("Album not found");
    }

    let imagePath = albums[index].imagePath;
    if (image?.base64 && image?.name) {
      const extension = path.extname(image.name);
      imagePath = path.join(IMAGE_DIR_PATH, `${id}${extension}`);
      await fs.mkdir(IMAGE_DIR_PATH, { recursive: true });
      const base64Data = image.base64.replace(/^data:image\/\w+;base64,/, "");
      await fs.writeFile(imagePath, base64Data, "base64");
      console.log("Updated image saved", { path: imagePath });
    }

    const user = await userData();
    if (!user) {
      console.error("User data not found, cannot update album");
    }
    albums[index] = { id, name, date, imagePath, userId: user.id };
    await fs.writeFile(ALBUM_FILE_PATH, JSON.stringify(albums, null, 2), "utf-8");


    await appendToSyncQueue({
      action: "update",
      id,
      name,
      date,
      imagePath,
      imageBase64: image?.base64 || null,
      userId: user.id,
    });
    console.log("Album updated successfully", { id });
    return albums[index];
  } catch (err) {
    console.error("Error updating album", { error: err.message, stack: err.stack });
    throw err;
  }
});

ipcMain.handle("albums:delete", async (_, id) => {
  await ensureAlbumFileStructure();
  console.log("Deleting album", { id });
  try {
    const raw = await fs.readFile(ALBUM_FILE_PATH, "utf-8");
    let albums = JSON.parse(raw);
    const album = albums.find((a) => a.id === id);

    if (!album) {
      console.error("Album not found for deletion", { id });
      return { success: false, error: "Album not found" };
    }

    albums = albums.filter((a) => a.id !== id);

    if (album.imagePath) {
      try {
        await fs.unlink(album.imagePath);
        console.log("Image deleted", { path: album.imagePath });
      } catch (err) {
        console.warn("Failed to delete image, continuing", { path: album.imagePath, error: err.message });
      }
    }
    const user = await userData();
    if (!user) {
      console.error("User data not found, cannot update album");
    }

    await fs.writeFile(ALBUM_FILE_PATH, JSON.stringify(albums, null, 2), "utf-8");
    await appendToSyncQueue({
      action: "delete",
      id,
      userId: user.id
    });
    console.log("Album deleted successfully", { id });
    return { success: true };
  } catch (err) {
    console.error("Error deleting album", { error: err.message, stack: err.stack });
    return { success: false, error: err.message };
  }
});

ipcMain.handle("sync:albums", async () => {
  if (isOnline()) {
    try {
      let queue = [];

      try {
        const raw = await fs.readFile(SYNC_FILE_PATH, "utf-8");
        queue = raw.trim() ? JSON.parse(raw) : [];
      } catch (err) {
        if (err.code === "ENOENT") {
          console.log("Sync queue not found. Nothing to sync.");
          return { success: true, message: "No queue file" };
        } else {
          throw err;
        }
      }

      if (queue.length === 0) {
        console.log("Sync queue is empty.");
        return { success: true, message: "Nothing to sync" };
      }

      console.log(`Syncing ${queue.length} albums to cloud...`);

      for (const entry of queue) {
        const { action, album, id, name, date, imageBase64, imagePath, userId } = entry;

        try {
          if (action === "create") {
            console.log("Syncing CREATE for album", album?.id);
            await axiosInstance.post("/api/albums", {
              ...album,
              imageBase64,
              localImagePath: imagePath,
            });

          } else if (action === "update") {
            console.log("Syncing UPDATE for album", id);
            await axiosInstance.put(`/api/albums/${id}`, {
              name,
              date,
              userId,
              imageBase64,
              localImagePath: imagePath,
            });

          } else if (action === "delete") {
            console.log("Syncing DELETE for album", id);
            await axiosInstance.delete(`/api/albums/${id}`);
          }
        } catch (err) {
          console.warn("Failed to sync one entry:", err.message);
        }
      }

      await fs.writeFile(SYNC_FILE_PATH, JSON.stringify([], null, 2), "utf-8");
      console.log("Sync completed. Queue cleared.");

      return { success: true, message: "Synced successfully" };
    } catch (err) {
      console.error("Error during cloud sync:", err);
      return { success: false, error: err.message };
    }
  }
});


ipcMain.handle("ping", async () => {
  logger.info("Ping received from renderer");
  return "pong";
});

ipcMain.handle("dialog:selectFolder", async () => {
  logger.info("Opening folder selection dialog");
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });

  if (result.canceled) {
    logger.info("Folder selection canceled");
    return null;
  }

  logger.info("Folder selected", { path: result.filePaths[0] });
  return result.filePaths[0];
});

ipcMain.handle("start-ftp", async (event, { username, directory, albumId, albumName, token }) => {
  logger.info("Starting FTP server", { username, directory, albumId, albumName });
  return await startFtpServer(username, directory, albumId, albumName, token);
});

ipcMain.handle("reset-ftp-credentials", async () => {
  userCredentials.clear();
  directories.clear();
  albumIds.clear();
  albumNames.clear();
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
  logger.info("New password generated and saved", {
    username: normalizedUsername,
    password: newPassword,
  });

  const savedCredentials = await mainWindow.webContents.executeJavaScript(
    'localStorage.getItem("ftpCredentials")'
  );
  if (savedCredentials) {
    const creds = JSON.parse(savedCredentials);
    if (creds.username === normalizedUsername) {
      creds.password = newPassword;
      await mainWindow.webContents.executeJavaScript(
        `localStorage.setItem("ftpCredentials", ${JSON.stringify(JSON.stringify(creds))})`
      );
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
          await new Promise((resolve) => setTimeout(resolve, delay));
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
        public_id: publicId,
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
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ albumId, imageUrl: cloudinaryUrl }),
      })
    );

    if (!response.ok) {
      const errorData = await response.json();
      logger.error("Failed to save photo to database", {
        cloudinaryUrl,
        albumId,
        status: response.status,
        error: errorData.error || "Unknown error",
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

ipcMain.handle("sync-photos-to-cloud", async (event, { albumName, albumId  }) => {
  logger.info("Syncing photos to cloud", { albumName, albumId });

  try {
    await loadPhotosData();
    const localPhotos = photosData[albumName] || [];
    logger.info("Local photos fetched for sync", { albumName, count: localPhotos.length });

    const retry = async (fn, retries = 3, baseDelay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (error) {
          logger.warn(`Attempt ${i + 1} failed`, { error: error.message });
          if (i === retries - 1) throw error;
          const delay = baseDelay * Math.pow(2, i);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    };

    const syncedPhotos = [];
    for (const photo of localPhotos) {
      try {
        if (photo.imageUrl.startsWith("https://res.cloudinary.com")) {
          logger.info("Photo already in cloud", { photoId: photo.id, url: photo.imageUrl });
          syncedPhotos.push(photo);
          continue;
        }

        const filePath = photo.imageUrl.replace(/^file:\/\//, "").replace(/\//g, path.sep);
        const fileBuffer = await fs.readFile(filePath);
        const base64Image = fileBuffer.toString("base64");

        const publicId = `image-${crypto.randomUUID()}`;
        const uploadResult = await retry(() =>
          cloudinary.uploader.upload(`data:image/jpeg;base64,${base64Image}`, {
            folder: "albums",
            resource_type: "image",
            public_id: publicId,
          })
        );

        console.log(uploadResult)

        const cloudinaryUrl = uploadResult.secure_url;
        logger.info("Image uploaded to Cloudinary", { photoId: photo.id, cloudinaryUrl });

        const user = await userData();
        const token = user.token;

        const response = await retry(() =>
          fetch(`${SERVER_URL}/api/upload-photo`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ albumId, imageUrl: cloudinaryUrl }),
          })
        );

        console.log(response)

        if (!response.ok) {
          const errorData = await response.json();
          logger.error("Failed to save photo to server database", {
            cloudinaryUrl,
            albumId,
            status: response.status,
            error: errorData.error || "Unknown error",
          });
          throw new Error(errorData.error || "Failed to save photo to server");
        }

        photosData[albumName] = photosData[albumName].map((p) =>
          p.id === photo.id ? { ...p, imageUrl: cloudinaryUrl } : p
        );
        await savePhotosData();
        logger.info("Updated photo URL in JSON storage", {
          photoId: photo.id,
          cloudinaryUrl,
          albumName,
          source: "User-selected album",
        });

        syncedPhotos.push({ ...photo, url: cloudinaryUrl, imageUrl: cloudinaryUrl });
      } catch (error) {
        logger.error("Failed to sync photo", { photoId: photo.id, error: error.message });
      }
    }

    return syncedPhotos;
  } catch (error) {
    logger.error("Error syncing photos to cloud", { albumName, error: error.message });
    throw error;
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


const albumsFilePath = path.join(app.getPath("userData"), "");

const loadAlbumsData = async () => {
  try {
    const data = await fs.readFile(albumsFilePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(albumsFilePath, JSON.stringify([], null, 2));
      return [];
    }
    throw error;
  }
};

const saveAlbumsData = async (albums) => {
  await fs.writeFile(albumsFilePath, JSON.stringify(albums, null, 2));
};

ipcMain.handle("fetch-albums", async () => {
  logger.info("Fetching albums from albums.json");
  return await loadAlbumsData();
});

ipcMain.handle("create-album", async (event, album) => {
  logger.info("Creating new album", { album });
  const albums = await loadAlbumsData();
  const newAlbum = { ...album, id: uuidv4(), createdAt: new Date().toISOString() };
  albums.push(newAlbum);
  await saveAlbumsData(albums);
  return newAlbum;
});

ipcMain.handle("update-album", async (event, updatedAlbum) => {
  logger.info("Updating album", { updatedAlbum });
  const albums = await loadAlbumsData();
  const idx = albums.findIndex((a) => a.id === updatedAlbum.id);
  if (idx === -1) throw new Error("Album not found");
  albums[idx] = { ...albums[idx], ...updatedAlbum };
  await saveAlbumsData(albums);
  return albums[idx];
});

ipcMain.handle("delete-album", async (event, albumId) => {
  logger.info("Deleting album", { albumId });
  let albums = await loadAlbumsData();
  const before = albums.length;
  albums = albums.filter((a) => a.id !== albumId);
  await saveAlbumsData(albums);
  return { success: true, removed: before - albums.length };
});

app.whenReady().then(async () => {
  try {
    await loadFtpPassword();
    await loadPhotosData();
    await ensureAlbumFileStructure();
    logger.info("Electron app starting");
    console.log("App Ready:", app.isReady());
    console.log("userData Path:", app.getPath('userData'));
    console.log("File exists?", await fs.access(ALBUM_FILE_PATH).then(() => true).catch(() => false));
    createWindow();
    Menu.setApplicationMenu(null);
  } catch (error) {
    logger.error("App initialization failed", { error: error.message });
  }
});

const notifyRendererToClearCredentials = () => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    win.webContents.send("clear-ftp-credentials", {
      message: "App is closing, clear FTP credentials and localStorage",
    });
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
