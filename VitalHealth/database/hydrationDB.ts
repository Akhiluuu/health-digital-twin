// database/hydrationDB.ts
// Uses the unified vital_health.db via shared connection from index.ts

import { db } from "./index";

import { log } from "../utils/logger";
import { getLocalDateString } from "../utils/twinUtils";

///////////////////////////////////////////////////////////
// INIT — no-op: table created by initAllTables in schema.ts
///////////////////////////////////////////////////////////

export async function initHydrationDB() {
  log("💧 Hydration DB ready (shared vital_health.db)");
}

///////////////////////////////////////////////////////////
// ADD WATER (NORMAL - APP OPEN)
///////////////////////////////////////////////////////////

export async function addWater(amount: number) {
  try {
    const today = getLocalDateString();
    const existing: any = await db.getFirstAsync(
      "SELECT amount FROM hydration WHERE date = ?",
      [today]
    );
    if (existing) {
      await db.runAsync(
        "UPDATE hydration SET amount = amount + ? WHERE date = ?",
        [amount, today]
      );
    } else {
      await db.runAsync(
        "INSERT INTO hydration (date, amount) VALUES (?, ?)",
        [today, amount]
      );
    }
    log("💧 Water added:", amount);
  } catch (error) {
    log("❌ Add water error:", error);
  }
}

///////////////////////////////////////////////////////////
// BACKGROUND-SAFE ADD (from notification handler)
///////////////////////////////////////////////////////////

export async function addWaterFromNotification(amount: number) {
  try {
    const today = getLocalDateString();
    const existing: any = await db.getFirstAsync(
      "SELECT amount FROM hydration WHERE date = ?",
      [today]
    );
    if (existing) {
      await db.runAsync(
        "UPDATE hydration SET amount = amount + ? WHERE date = ?",
        [amount, today]
      );
    } else {
      await db.runAsync(
        "INSERT INTO hydration (date, amount) VALUES (?, ?)",
        [today, amount]
      );
    }
    log("✅ Water added from notification:", amount);
  } catch (error) {
    log("❌ Background hydration error:", error);
  }
}

///////////////////////////////////////////////////////////
// GET TODAY
///////////////////////////////////////////////////////////

export async function getTodayWater() {
  try {
    const today = getLocalDateString();
    const result: any = await db.getFirstAsync(
      "SELECT amount FROM hydration WHERE date = ?",
      [today]
    );
    return result?.amount || 0;
  } catch (error) {
    log("❌ Get hydration error:", error);
    return 0;
  }
}

///////////////////////////////////////////////////////////
// GET LAST N DAYS (for charts)
///////////////////////////////////////////////////////////

export async function getHydrationHistory(days: number = 7): Promise<{ date: string; amount: number }[]> {
  try {
    return ((await db.getAllAsync(
      `SELECT date, amount FROM hydration
       ORDER BY date DESC
       LIMIT ?`,
      [days]
    )) as { date: string; amount: number }[]) || [];
  } catch (error) {
    log("❌ Hydration history error:", error);
    return [];
  }
}