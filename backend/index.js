import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import crypto from "crypto";

let activeAdminSession = null;

import { pendingApplications, preAuthTokens } from "./state.js";
import { initBot, approveUser, revokeUser } from "./bot.js";
import { readDb, writeDb } from "./database.js";

// Load configuration
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(cookieParser());

// Serve built React static frontend
const clientDistPath = path.join(__dirname, "../dist/client");
app.use(express.static(clientDistPath));

/* ---------------- API Routes ---------------- */

// Submit registration application from web
app.post("/api/register", (req, res) => {
  const { username, discordId, token, edition } = req.body;

  if (!username || !discordId || !token || !edition) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  // Regex validation for Minecraft username
  // Allow optional * prefix for Bedrock
  const usernameRegex = /^\*?[a-zA-Z0-9_]{3,16}$/;
  if (!usernameRegex.test(username)) {
    return res.status(400).json({ error: "Invalid Minecraft username format." });
  }

  if (!["java", "bedrock"].includes(edition)) {
    return res.status(400).json({ error: "Invalid edition value." });
  }

  // Validate bot token
  const authRecord = preAuthTokens.get(token);
  if (!authRecord || authRecord.discordId !== discordId) {
    return res.status(403).json({ error: "Invalid or expired verification session token." });
  }

  const discordUsername = authRecord.discordUsername || "Unknown";

  // Extract client IP address securely
  const ipAddress = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].replace("::ffff:", "").trim();

  // Prevent double pending submissions from the same Discord account or IP
  const isAlreadyPending = Array.from(pendingApplications.values()).some(
    (app) => app.discordId === discordId || app.ipAddress === ipAddress
  );
  if (isAlreadyPending) {
    return res.status(400).json({ error: "You already have an active whitelist application pending in our staff queue." });
  }

  const db = readDb();

  // Prevent duplicate whitelisting of the same Minecraft nickname (case-insensitive)
  const isUsernameTaken = db.whitelisted.some(
    (player) => player.username.toLowerCase() === username.trim().toLowerCase()
  );
  if (isUsernameTaken) {
    return res.status(400).json({ error: "This Minecraft username is already registered to a whitelisted player." });
  }

  // Prevent whitelisting if the Discord account is already linked to another whitelisted player
  const isDiscordLinked = db.whitelisted.some(
    (player) => player.discordId === discordId
  );
  if (isDiscordLinked) {
    return res.status(400).json({ error: "Your Discord account is already whitelisted with another Minecraft nickname." });
  }

  // Generate unique application ID
  const appId = `app_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // Save to queue
  pendingApplications.set(appId, {
    id: appId,
    username: username.trim(),
    discordId,
    discordUsername,
    edition,
    submittedAt: new Date().toISOString(),
    ipAddress
  });

  // Consume token
  preAuthTokens.delete(token);

  res.json({ ok: true });
});

// Admin Passphrase Auth
app.post("/api/admin/login", (req, res) => {
  const { passphrase } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD || "nalex";

  if (passphrase === adminPass) {
    // Generate cryptographically secure random 32-byte session token
    activeAdminSession = crypto.randomBytes(32).toString("hex");

    res.cookie("admin_auth", activeAdminSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      sameSite: "strict"
    });
    return res.json({ ok: true });
  }

  return res.status(401).json({ error: "Invalid passphrase. Access denied." });
});

// Admin Logout Route
app.post("/api/admin/logout", (req, res) => {
  activeAdminSession = null;
  res.clearCookie("admin_auth");
  res.json({ ok: true });
});

// Admin Authorization Middleware
function requireAdmin(req, res, next) {
  const auth = req.cookies.admin_auth;
  if (auth && auth === activeAdminSession) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized." });
}

// Fetch pending queue, stats, and past decision logs
app.get("/api/admin/queue", requireAdmin, (req, res) => {
  const list = Array.from(pendingApplications.values());
  list.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
  
  const db = readDb();
  
  res.json({
    queue: list,
    stats: {
      pendingCount: list.length,
      approvedCount: db.stats.approvedCount,
      rejectedCount: db.stats.rejectedCount,
      totalWhitelisted: db.whitelisted.length
    },
    whitelisted: db.whitelisted,
    logs: (db.logs || []).slice().reverse()
  });
});

// Perform manual approval / rejection action
app.post("/api/admin/action", requireAdmin, async (req, res) => {
  const { id, action } = req.body;

  if (!id || !["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "Invalid parameters." });
  }

  const appRecord = pendingApplications.get(id);
  if (!appRecord) {
    return res.status(404).json({ error: "Application not found in queue." });
  }

  // Remove from memory
  pendingApplications.delete(id);

  const db = readDb();

  // Update statistics and process bot commands
  if (action === "approve") {
    db.stats.approvedCount++;
    
    // Add to persistent whitelist database list
    db.whitelisted.push({
      id: `wl_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      username: appRecord.username,
      discordId: appRecord.discordId,
      discordUsername: appRecord.discordUsername || "Unknown",
      edition: appRecord.edition,
      ipAddress: appRecord.ipAddress || "Unknown",
      whitelistedAt: new Date().toISOString()
    });

    // Process bot approval commands asynchronously
    approveUser(appRecord.discordId, appRecord.username, appRecord.edition).catch((err) => {
      console.error(`Error approving user ${appRecord.username}:`, err);
    });
  } else {
    db.stats.rejectedCount++;
  }

  // Append to decision logs list
  if (!db.logs) {
    db.logs = [];
  }
  db.logs.push({
    username: appRecord.username,
    discordId: appRecord.discordId,
    discordUsername: appRecord.discordUsername || "Unknown",
    edition: appRecord.edition,
    action,
    processedAt: new Date().toISOString(),
    ipAddress: appRecord.ipAddress
  });

  // Maintain max list size of 50 entries
  if (db.logs.length > 50) {
    db.logs.shift();
  }

  // Persist back to database.json
  writeDb(db);

  res.json({ ok: true });
});

// Revoke user access through the portal
app.post("/api/admin/revoke", requireAdmin, async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: "Missing whitelisted ID." });
  }

  const db = readDb();
  const recordIndex = db.whitelisted.findIndex((item) => item.id === id);

  if (recordIndex === -1) {
    return res.status(404).json({ error: "Whitelisted player not found." });
  }

  // Remove the record
  const [removedRecord] = db.whitelisted.splice(recordIndex, 1);

  // Append to decision logs list
  if (!db.logs) {
    db.logs = [];
  }
  db.logs.push({
    username: removedRecord.username,
    discordId: removedRecord.discordId,
    discordUsername: removedRecord.discordUsername || "Unknown",
    edition: removedRecord.edition,
    action: "revoke",
    processedAt: new Date().toISOString(),
    ipAddress: removedRecord.ipAddress
  });

  // Maintain max list size of 50 entries
  if (db.logs.length > 50) {
    db.logs.shift();
  }

  // Persist back to database.json
  writeDb(db);

  console.log(`[Server] Revoking whitelist for ${removedRecord.username} through Admin panel.`);

  // Process bot removal commands asynchronously
  revokeUser(removedRecord.discordId, removedRecord.username, removedRecord.edition).catch((err) => {
    console.error(`Error revoking user ${removedRecord.username}:`, err);
  });

  res.json({ ok: true });
});

// Fallback all other client routing to SPA entry
app.get(/^(.*)$/, (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API Route not found." });
  }
  res.sendFile(path.join(clientDistPath, "index.html"));
});

// Initialize systems
async function startServer() {
  await initBot();

  app.listen(PORT, () => {
    console.log(`[Server] Whitelist Gateway running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Critical server startup failure:", err);
});
