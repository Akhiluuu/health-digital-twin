// services/medicineSync.ts
// ─────────────────────────────────────────────────────────────────
// Syncs medicines FROM Firebase INTO local SQLite on app start.
//
// ✅ FIX (Duplicate Bug): Before inserting any Firebase record we
//    check if a row with that id already exists in SQLite. If it
//    does, we skip the insert entirely. This prevents duplicates
//    every time the app restarts.
//
// ✅ FIX (Relogin Restore): Now uses INSERT OR REPLACE with the
//    takenDate column and re-schedules notifee alarms for medicines
//    that were restored from Firebase but lost their local alarms.
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

      // ✅ FIX: Use INSERT OR REPLACE with all columns including takenDate.
      //    This ensures schema compatibility after the takenDate migration.
      db.runSync(
        `INSERT OR REPLACE INTO medicines
          (id, name, dose, type, time, timestamp, meal, frequency,
           startDate, endDate, reminder, notificationId, taken, takenDate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          // ✅ Clear notificationId so the reschedule pass below can detect
          //    that a new alarm needs to be created.
          null,
          // ✅ Never restore a stale `taken` flag from Firebase.
          //    Always start fresh as 0; date-scoped logic handles display.
          0,
          null, // takenDate — always reset on restore
        ]
      );
      inserted++;
    }

    console.log(
      `☁️ Medicine sync complete — inserted: ${inserted}, skipped (already local): ${skipped}`
    );

    // ✅ FIX: Re-schedule notifications for newly-restored medicines.
    //    After a relogin, medicines are back in SQLite but their notifee
    //    alarms are gone (device-local, not stored in Firebase).
    if (inserted > 0) {
      try {
        const {
          scheduleMedicineDaily,
          scheduleMedicineOnce,
        } = await import("./notifeeService");

        const {
          updateMedicineNotificationId,
          getMedicines,
        } = await import("../database/medicineDB");

        const {
          syncUpdateMedicineNotificationId,
        } = await import("./firebaseSync");

        const allMeds = getMedicines();
        const now = new Date();

        for (const med of allMeds) {
          // Only reschedule if reminder is on and notificationId is missing
          if (!med.reminder || med.notificationId) continue;

          try {
            const dateObj = new Date(med.timestamp);
            const freq    = (med.frequency ?? "").toLowerCase();
            let notifId: string | null = null;

            if (freq === "once" && dateObj.getTime() > now.getTime()) {
              notifId = await scheduleMedicineOnce(
                `${med.name} — ${med.dose}`,
                dateObj,
                med.id
              );
            } else if (freq === "daily") {
              notifId = await scheduleMedicineDaily(
                `${med.name} — ${med.dose}`,
                dateObj.getHours(),
                dateObj.getMinutes(),
                med.id
              );
            }

            if (notifId) {
              updateMedicineNotificationId(med.id, notifId);
              syncUpdateMedicineNotificationId(med.id, notifId).catch(() => {});
              console.log(`🔔 Re-scheduled notification for restored medicine: ${med.name}`);
            }
          } catch (notifErr) {
            console.log("⚠️ Could not reschedule notification for:", med.name, notifErr);
          }
        }
      } catch (rescheduleErr) {
        console.log("⚠️ Notification reschedule pass failed (non-critical):", rescheduleErr);
      }
    }
  } catch (err) {
    console.log("⚠️ syncMedicinesFromFirebase error (non-critical):", err);
  }
}