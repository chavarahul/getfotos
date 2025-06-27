const path = require("path");
const fs = require("fs/promises");

const APP_DATA_PATH = path.join(__dirname, "data");
const ALBUM_FILE_PATH = path.join(APP_DATA_PATH, "album.json");
const IMAGE_DIR_PATH = path.join(APP_DATA_PATH, "images");
const USER_FILE_PATH = path.join(APP_DATA_PATH, "user.json");

async function ensureFileStructure() {
  try {
    await fs.mkdir(APP_DATA_PATH, { recursive: true });

    await fs.mkdir(IMAGE_DIR_PATH, { recursive: true });

    try {
      await fs.access(ALBUM_FILE_PATH);
    } catch {
      await fs.writeFile(ALBUM_FILE_PATH, JSON.stringify([]));
    }

    try {
      await fs.access(USER_FILE_PATH);
    } catch {
      await fs.writeFile(USER_FILE_PATH, JSON.stringify({ id: "1234", name: "User" }));
    }

    console.log("✅ File structure ready");
  } catch (err) {
    console.error("❌ Error ensuring file structure:", err);
  }
}

module.exports = {
  ensureFileStructure,
  APP_DATA_PATH,
  ALBUM_FILE_PATH,
  IMAGE_DIR_PATH,
  USER_FILE_PATH,
};
