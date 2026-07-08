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

import { log } from "../utils/logger";

export async function syncMedicinesFromFirebase(): Promise<void> {
  try {
    const remoteMedicines = await fetchMedicinesFromFirebase();

    if (!remoteMedicines || remoteMedicines.length === 0) {
      log("☁️ No remote medicines to sync");
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

    log(
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
              log(`🔔 Re-scheduled notification for restored medicine: ${med.name}`);
            }
          } catch (notifErr) {
            log("⚠️ Could not reschedule notification for:", med.name, notifErr);
          }
        }
      } catch (rescheduleErr) {
        log("⚠️ Notification reschedule pass failed (non-critical):", rescheduleErr);
      }
    }
  } catch (err) {
    log("⚠️ syncMedicinesFromFirebase error (non-critical):", err);
  }
}

export async function syncAndScheduleAllFamilyMedicines(members: any[]): Promise<void> {
  try {
    log(`🔄 Starting sync & reschedule pass for ${members.length} family members...`);
    const {
      scheduleMedicineDaily,
      scheduleMedicineOnce,
      cancelMedicineNotification,
    } = await import("./notifeeService");
    const notifee = (await import("@notifee/react-native")).default;

    const triggers = await notifee.getTriggerNotifications();
    const scheduledIds = new Set(triggers.map((t: any) => t.notification.id));

    const { getTwinId } = await import("../utils/twinUtils");
    const { fetchMedicinesFromFirebase } = await import("./firebaseSync");

    for (const member of members) {
      const memberId = member.id || member.uid || member.userId;
      if (!memberId || memberId === "self") continue;

      const profileName = member.firstName
        ? `${member.firstName} ${member.lastName || ""}`.trim()
        : member.name || "Family Member";

      log(`[MedicineSync] Fetching medicines for family member: ${profileName} (${memberId})`);
      const meds = await fetchMedicinesFromFirebase(memberId);

      // Keep track of which IDs should be scheduled for this member
      const activeMedNotifIds = new Set<string>();
      const now = new Date();

      for (const med of meds) {
        if (!med.id) continue;
        const deterministicId = `med_${memberId}_${med.id}`;

        if (med.reminder) {
          activeMedNotifIds.add(deterministicId);

          if (!scheduledIds.has(deterministicId)) {
            try {
              const dateObj = new Date(med.timestamp);
              const freq = (med.frequency ?? "").toLowerCase();
              let scheduledId = "";

              if (freq === "once" && dateObj.getTime() > now.getTime()) {
                scheduledId = await scheduleMedicineOnce(
                  `${med.name} — ${med.dose}`,
                  dateObj,
                  med.id,
                  memberId,
                  profileName,
                  med.name,
                  med.dose,
                  med.time,
                  med.frequency
                );
              } else if (freq === "daily") {
                scheduledId = await scheduleMedicineDaily(
                  `${med.name} — ${med.dose}`,
                  dateObj.getHours(),
                  dateObj.getMinutes(),
                  med.id,
                  memberId,
                  profileName,
                  med.name,
                  med.dose,
                  med.time,
                  med.frequency
                );
              }

              if (scheduledId) {
                log(`🔔 Scheduled notification for ${profileName}'s medicine: ${med.name} (${scheduledId})`);
              }
            } catch (err) {
              log(`❌ Failed to schedule medicine ${med.name} for ${profileName}:`, err);
            }
          }
        }
      }

      // Clean up orphaned or turned-off alarms for this member
      for (const t of triggers) {
        const notifId = t.notification.id;
        if (notifId && notifId.startsWith(`med_${memberId}_`) && !activeMedNotifIds.has(notifId)) {
          log(`🗑 Cancelling orphaned notification for ${profileName}: ${notifId}`);
          await cancelMedicineNotification(notifId).catch(() => {});
        }
      }
    }
    log("✅ Finished sync & reschedule pass for all family members.");
  } catch (err) {
    log("❌ Error in syncAndScheduleAllFamilyMedicines:", err);
  }
}