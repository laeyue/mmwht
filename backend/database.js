import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "database.json");

const defaultData = {
  whitelisted: [],
  stats: {
    approvedCount: 0,
    rejectedCount: 0
  },
  logs: []
};

export function readDb() {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2), "utf8");
      return defaultData;
    }
    const raw = fs.readFileSync(dbPath, "utf8");
    const data = JSON.parse(raw);
    if (!data.logs) {
      data.logs = [];
    }
    return data;
  } catch (err) {
    console.error("[Database] Failed to read JSON database, returning defaults:", err);
    return defaultData;
  }
}

export function writeDb(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[Database] Failed to write JSON database:", err);
  }
}
