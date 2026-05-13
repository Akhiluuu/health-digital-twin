// services/medicineSync.ts
// ─────────────────────────────────────────────────────────────────
// Syncs medicines FROM Firebase INTO local SQLite on app start.
//
// ✅ FIX (Duplicate Bug): Before inserting any Firebase record we
//    check if a row with that id already exists in SQLite. If it
//    does, we skip the insert entirely. This prevents duplicates
//    every time the app restarts.
// ─────────────────────────────────────────────────────────────────

import { db } from "../database/index";
import { fetchMedicinesFromFirebase } from "./firebaseSync";

export async function syncMedicinesFromFirebase(): Promise<void> {
  try {
    const remoteMedicines = await fetchMedicinesFromFirebase();

    if (!remoteMedicines || remoteMedicines.length === 0) {
      console.log("☁️ No remote medicines to sync");
      return;
    }

    let inserted = 0;
    let skipped  = 0;

    for (const med of remoteMedicines) {
      // ✅ KEY FIX: check by Firebase id (which equals the SQLite id)
      const existing = db.getFirstSync<{ id: number }>(
        "SELECT id FROM medicines WHERE id = ?",
        [med.id]
      );

      if (existing) {
        // Row already in local DB — skip to avoid duplicate
        skipped++;
        continue;
      }

      // Safe to insert — this medicine is not in local DB yet
      db.runSync(
        `INSERT INTO medicines
          (id, name, dose, type, time, timestamp, meal, frequency,
           startDate, endDate, reminder, notificationId, taken)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          med.id,
          med.name           ?? "",
          med.dose           ?? "",
          med.type           ?? "",
          med.time           ?? "",
          med.timestamp      ?? 0,
          med.meal           ?? "",
          med.frequency      ?? "daily",
          med.startDate      ?? "",
          med.endDate        ?? "",
          med.reminder       ?? 0,
          med.notificationId ?? null,
          // ✅ Never restore a stale `taken` flag from Firebase.
          //    Always start fresh as 0; date-scoped logic handles display.
          0,
        ]
      );
      inserted++;
    }

    console.log(
      `☁️ Medicine sync complete — inserted: ${inserted}, skipped (already local): ${skipped}`
    );
  } catch (err) {
    console.log("⚠️ syncMedicinesFromFirebase error (non-critical):", err);
  }
}