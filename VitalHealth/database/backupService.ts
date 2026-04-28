// database/backupService.ts
// ─── Google Drive Backup & Restore for VitalHealth ───────────────────────────
//
// STRATEGY:
//   1. exportDBToJSON()         — reads every table from vital_health.db → JSON blob
//   2. uploadToGoogleDrive()    — OAuth + Drive REST API → uploads as
//                                 "vitalhealth_backup_<date>.json" in App Data folder
//   3. downloadFromGoogleDrive()— fetches the most recent backup file
//   4. importDBFromJSON()       — wipes and re-inserts all rows (full restore)
//
// PRIVACY:  Uses the "appDataFolder" Drive scope so the backup file is
//           private to the app — NOT visible in the user's My Drive.
//
// OAUTH:    Pure-JS OAuth 2.0 + PKCE via expo-web-browser + Hermes crypto.subtle.
//           expo-auth-session is intentionally NOT used — it pulls in the
//           ExpoCrypto native module at import time, which crashes Expo Go / dev
//           builds that haven't done a native rebuild.

import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "./index";

// Ensure any lingering auth-session redirect is dismissed on web
WebBrowser.maybeCompleteAuthSession();

// ─── Google OAuth config ──────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ||
  "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com";

const GOOGLE_CLIENT_SECRET =
  process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET || "";

// The redirect URI must be registered in your Google Cloud OAuth client.
// For Expo dev builds / EAS: use the custom scheme registered in app.config.js.
const REDIRECT_URI = "vitalhealth://oauth2redirect/google";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const BACKUP_FILENAME_PREFIX = "vitalhealth_backup";
const ACCESS_TOKEN_KEY = "@gdrive_access_token";
const TOKEN_EXPIRY_KEY = "@gdrive_token_expiry";

// ─── Tables to back up (in restore order) ────────────────────────────────────
const BACKUP_TABLES = [
  "user_profile",
  "medicines",
  "medicine_history",
  "hydration",
  "symptoms",
  "history",
  "simulation_history",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// PKCE helpers — Hermes built-in globalThis.crypto (no native module needed)
// ─────────────────────────────────────────────────────────────────────────────

async function generateCodeVerifier(): Promise<string> {
  const randomBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    encoder.encode(verifier)
  );
  const hashBytes = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...hashBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT  — read every table → single JSON object
// ─────────────────────────────────────────────────────────────────────────────

export async function exportDBToJSON(): Promise<string> {
  const backup: Record<string, any[]> = {
    _meta: {
      version: 3,
      exported_at: new Date().toISOString(),
      app: "VitalHealth",
    },
  } as any;

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await db.getAllAsync(`SELECT * FROM ${table}`);
      backup[table] = rows || [];
    } catch {
      backup[table] = []; // table may not exist yet on older installs
    }
  }

  const json = JSON.stringify(backup, null, 2);
  console.log(
    `📦 Backup export: ${BACKUP_TABLES.length} tables, ${(json.length / 1024).toFixed(1)} KB`
  );
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT  — full restore (wipe + re-insert)
// ─────────────────────────────────────────────────────────────────────────────

export async function importDBFromJSON(json: string): Promise<void> {
  const backup = JSON.parse(json);

  if (!backup._meta) throw new Error("Invalid backup file — missing _meta header.");

  console.log("🔄 Restoring from backup:", backup._meta.exported_at);

  await db.execAsync("BEGIN TRANSACTION;");
  try {
    for (const table of BACKUP_TABLES) {
      const rows: any[] = backup[table] || [];
      await db.execAsync(`DELETE FROM ${table};`);
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => "?").join(", ");
        const values = cols.map((c) => row[c]);
        await db.runAsync(
          `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
          values
        );
      }
      console.log(`  ✅ Restored ${rows.length} rows → ${table}`);
    }
    await db.execAsync("COMMIT;");
    console.log("✅ Database restore complete.");
  } catch (err) {
    await db.execAsync("ROLLBACK;");
    console.error("❌ Restore failed — rolled back:", err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE OAUTH — get / refresh access token (pure-JS PKCE, no native module)
// ─────────────────────────────────────────────────────────────────────────────

async function getStoredAccessToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    const expiry = await AsyncStorage.getItem(TOKEN_EXPIRY_KEY);
    if (token && expiry && Date.now() < Number(expiry)) return token;
    return null;
  } catch {
    return null;
  }
}

async function storeAccessToken(token: string, expiresInSeconds: number) {
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
  await AsyncStorage.setItem(
    TOKEN_EXPIRY_KEY,
    String(Date.now() + expiresInSeconds * 1000 - 60_000) // 1-min buffer
  );
}

export async function signInWithGoogle(): Promise<string> {
  // Return cached token if still valid
  const cached = await getStoredAccessToken();
  if (cached) return cached;

  // Generate PKCE pair using Hermes built-in crypto (no native module)
  const codeVerifier = await generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Generate a random state value to guard against CSRF
  const stateBytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(stateBytes);
  const state = Array.from(stateBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Build the Google authorization URL manually
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: [DRIVE_SCOPE, "profile", "email"].join(" "),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` + params.toString();

  // Open the system browser — no native crypto module required
  const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

  if (result.type !== "success" || !result.url) {
    throw new Error("Google sign-in cancelled or failed: " + result.type);
  }

  // Parse the redirect URL to extract `code` and `state`
  const redirectUrl = new URL(result.url);
  const returnedState = redirectUrl.searchParams.get("state");
  const code = redirectUrl.searchParams.get("code");
  const errorParam = redirectUrl.searchParams.get("error");

  if (errorParam) throw new Error("OAuth error: " + errorParam);
  if (returnedState !== state) throw new Error("OAuth state mismatch — possible CSRF.");
  if (!code) throw new Error("No authorization code in redirect.");

  // Exchange the code for an access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }).toString(),
  });

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error("Failed to get access token: " + JSON.stringify(tokenData));
  }

  await storeAccessToken(tokenData.access_token, tokenData.expires_in || 3600);
  return tokenData.access_token;
}

export async function signOutGoogle() {
  await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
  await AsyncStorage.removeItem(TOKEN_EXPIRY_KEY);
  console.log("✅ Google Drive signed out.");
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD to Google Drive (appDataFolder — private to app)
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadToGoogleDrive(json: string): Promise<string> {
  const accessToken = await signInWithGoogle();
  const filename = `${BACKUP_FILENAME_PREFIX}_${new Date().toISOString().slice(0, 10)}.json`;

  const boundary = "-------VitalHealthBackupBoundary";
  const metadata = JSON.stringify({ name: filename, parents: ["appDataFolder"] });

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${json}\r\n` +
    `--${boundary}--`;

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Drive upload failed: ${err}`);
  }

  const file = await uploadRes.json();

  await db.runAsync(
    `INSERT INTO backup_meta (backup_at, drive_file_id, status, size_bytes)
     VALUES (?, ?, 'success', ?)`,
    [new Date().toISOString(), file.id, json.length]
  );

  console.log("☁️ Backup uploaded to Google Drive:", file.id, filename);
  return file.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST backups in Drive appDataFolder
// ─────────────────────────────────────────────────────────────────────────────

export async function listDriveBackups(): Promise<
  Array<{ id: string; name: string; createdTime: string; size: string }>
> {
  const accessToken = await signInWithGoogle();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder` +
      `&fields=files(id,name,createdTime,size)` +
      `&q=name+contains+'${BACKUP_FILENAME_PREFIX}'` +
      `&orderBy=createdTime+desc&pageSize=10`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error("Failed to list backups: " + (await res.text()));
  const data = await res.json();
  return data.files || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD latest backup from Drive
// ─────────────────────────────────────────────────────────────────────────────

export async function downloadFromGoogleDrive(fileId?: string): Promise<string> {
  const accessToken = await signInWithGoogle();

  let targetId = fileId;
  if (!targetId) {
    const files = await listDriveBackups();
    if (files.length === 0) throw new Error("No backups found in Google Drive.");
    targetId = files[0].id;
    console.log("📥 Auto-selecting latest backup:", files[0].name);
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${targetId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) throw new Error("Drive download failed: " + (await res.text()));
  const json = await res.text();
  console.log(`📥 Downloaded backup: ${(json.length / 1024).toFixed(1)} KB`);
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE: full backup flow (export → upload)
// ─────────────────────────────────────────────────────────────────────────────

export async function performBackup(): Promise<{ fileId: string; sizeKB: number }> {
  const json = await exportDBToJSON();
  const fileId = await uploadToGoogleDrive(json);
  return { fileId, sizeKB: Math.round(json.length / 1024) };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE: full restore flow (download → import)
// ─────────────────────────────────────────────────────────────────────────────

export async function performRestore(fileId?: string): Promise<void> {
  const json = await downloadFromGoogleDrive(fileId);
  await importDBFromJSON(json);
}

// ─────────────────────────────────────────────────────────────────────────────
// Get last backup time from local meta table
// ─────────────────────────────────────────────────────────────────────────────

export async function getLastBackupTime(): Promise<string | null> {
  try {
    const row: any = await db.getFirstAsync(
      "SELECT backup_at FROM backup_meta WHERE status='success' ORDER BY backup_at DESC LIMIT 1"
    );
    return row?.backup_at ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-BACKUP: backs up only if the last backup was more than 24 h ago
// ─────────────────────────────────────────────────────────────────────────────

export async function autoBackupIfNeeded(): Promise<void> {
  try {
    const lastAt = await getLastBackupTime();
    if (lastAt) {
      const ageMs = Date.now() - new Date(lastAt).getTime();
      if (ageMs < 24 * 60 * 60 * 1000) return; // backed up within 24 h
    }
    console.log("🔄 Auto-backup triggered (>24 h since last backup)...");
    await performBackup();
  } catch (err) {
    // Auto-backup failures are non-fatal — don't crash the app
    console.warn("⚠️ Auto-backup failed (non-fatal):", err);
  }
}
