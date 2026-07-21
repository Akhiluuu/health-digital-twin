// database/hydrationHistoryDB.ts
// Stores every water intake event with timestamp for history display
// Migrated to shared vital_health.db via index.ts

import { db } from "./index";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { log } from "../utils/logger";

///////////////////////////////////////////////////////////
// TYPES
///////////////////////////////////////////////////////////

export type HydrationEntry = {
  id: number;
  amount: number;       // ml added
  total: number;        // running total at time of entry
  timestamp: number;    // Unix ms
  source: "manual" | "notification"; // where the add came from
};

///////////////////////////////////////////////////////////
// INIT — no-op: table created by initAllTables in schema.ts
///////////////////////////////////////////////////////////

export async function initHydrationHistoryDB() {
  log("💧 Hydration history DB ready (shared vital_health.db)");
}

///////////////////////////////////////////////////////////
// INSERT ENTRY
///////////////////////////////////////////////////////////

export async function addHydrationEntry(
  amount: number,
  total: number,
  source: "manual" | "notification" = "manual",
  timestamp: number = Date.now()
) {
  try {
    // Prevent duplicate entries with the exact same timestamp
    const existing = db.getFirstSync(
      `SELECT id FROM hydration_history WHERE timestamp = ?`,
      [timestamp]
    ) as { id: number } | null;
    if (existing) {
      log(`💧 History entry with timestamp ${timestamp} already exists in SQLite, skipping.`);
      return;
    }
    await db.runAsync(
      `INSERT INTO hydration_history (amount, total, timestamp, source)
       VALUES (?, ?, ?, ?)`,
      [amount, total, timestamp, source]
    );
    log(`💧 History entry saved: +${amount}ml (total: ${total}ml) at ${timestamp}`);
  } catch (err) {
    log("❌ Hydration history insert error:", err);
  }
}

///////////////////////////////////////////////////////////
// GET TODAY'S HISTORY
///////////////////////////////////////////////////////////

export function getTodayHydrationHistory(): HydrationEntry[] {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const rows = db.getAllSync(
      `SELECT * FROM hydration_history WHERE timestamp >= ? ORDER BY timestamp ASC`,
      [startOfDay.getTime()]
    ) as HydrationEntry[];

    let running = 0;
    const mapped = rows.map(e => {
      running += e.amount;
      return { ...e, total: running };
    });

    // Return newest first for UI
    return mapped.reverse();
  } catch (err) {
    log("❌ Hydration history fetch error:", err);
    return [];
  }
}

///////////////////////////////////////////////////////////
// DEDUPLICATE HISTORY
///////////////////////////////////////////////////////////

export async function deduplicateHydrationHistory() {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const rows = db.getAllSync(
      `SELECT * FROM hydration_history WHERE timestamp >= ? ORDER BY timestamp ASC`,
      [startOfDay.getTime()]
    ) as HydrationEntry[];

    const idsToDelete: number[] = [];
    const timestampsToDelete: number[] = [];

    for (let i = 0; i < rows.length; i++) {
      const current = rows[i];
      for (let j = i + 1; j < rows.length; j++) {
        const next = rows[j];
        // Clean up duplicates (same amount, same source, and within 60 seconds)
        const timeDiff = Math.abs(current.timestamp - next.timestamp);
        if (
          timeDiff < 60000 &&
          current.amount === next.amount &&
          current.source === next.source &&
          !idsToDelete.includes(next.id)
        ) {
          idsToDelete.push(next.id);
          timestampsToDelete.push(next.timestamp);
        }
      }
    }

    if (idsToDelete.length > 0) {
      log(`💧 SQLite: Cleaning up ${idsToDelete.length} duplicate hydration entries`, idsToDelete);
      const placeholders = idsToDelete.map(() => "?").join(",");
      await db.runAsync(
        `DELETE FROM hydration_history WHERE id IN (${placeholders})`,
        idsToDelete
      );

      // Track deleted timestamps for Firebase sync
      try {
        const raw = await AsyncStorage.getItem("@deleted_hydration_timestamps_v1");
        const currentDeleted = raw ? JSON.parse(raw) : [];
        let updated = false;
        for (const ts of timestampsToDelete) {
          if (!currentDeleted.includes(ts)) {
            currentDeleted.push(ts);
            updated = true;
          }
        }
        if (updated) {
          await AsyncStorage.setItem("@deleted_hydration_timestamps_v1", JSON.stringify(currentDeleted));
        }
      } catch (err) {
        log("⚠️ Failed to store deleted hydration timestamps:", err);
      }
    }
  } catch (err) {
    log("❌ Hydration history deduplication error:", err);
  }
}

///////////////////////////////////////////////////////////
// CLEAR TODAY'S HISTORY
///////////////////////////////////////////////////////////

export async function clearTodayHydrationHistory() {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const rows = db.getAllSync(
      `SELECT timestamp FROM hydration_history WHERE timestamp >= ?`,
      [startOfDay.getTime()]
    ) as { timestamp: number }[];
    
    const timestamps = rows.map(r => r.timestamp);

    await db.runAsync(
      `DELETE FROM hydration_history WHERE timestamp >= ?`,
      [startOfDay.getTime()]
    );

    if (timestamps.length > 0) {
      try {
        const raw = await AsyncStorage.getItem("@deleted_hydration_timestamps_v1");
        const currentDeleted = raw ? JSON.parse(raw) : [];
        let updated = false;
        for (const ts of timestamps) {
          if (!currentDeleted.includes(ts)) {
            currentDeleted.push(ts);
            updated = true;
          }
        }
        if (updated) {
          await AsyncStorage.setItem("@deleted_hydration_timestamps_v1", JSON.stringify(currentDeleted));
        }
      } catch (err) {
        log("⚠️ Failed to store cleared hydration timestamps:", err);
      }
    }

    log("💧 Today's hydration history cleared");
  } catch (err) {
    log("❌ Hydration history clear error:", err);
  }
}

export { db as hydrationHistoryDb };