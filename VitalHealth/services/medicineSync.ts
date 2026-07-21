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
import { fetchMedicinesFromFirebase, syncDeleteMedicine } from "./firebaseSync";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { log } from "../utils/logger";

function getNextTriggerTime(timestamp: number, frequency: string): number {
  const dateObj = new Date(timestamp);
  const now = new Date();
  
  if (frequency.toLowerCase() === "daily") {
    const trigger = new Date();
    trigger.setHours(dateObj.getHours(), dateObj.getMinutes(), 0, 0);
    if (trigger.getTime() <= now.getTime()) {
      trigger.setDate(trigger.getDate() + 1);
    }
    return trigger.getTime();
  }
  
  return dateObj.getTime();
}

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
      // Skip empty medicines and delete them from Firebase
      if (!med || !med.name || !med.name.trim()) {
        log(`[medicineSync] Skipping and cleaning empty remote medicine ID: ${med?.id}`);
        if (med && med.id) {
          syncDeleteMedicine(med.id).catch(() => {});
        }
        continue;
      }

      // ✅ KEY FIX: check by Firebase id (which equals the SQLite id)
      const existing = db.getFirstSync(
        "SELECT id FROM medicines WHERE id = ?",
        [med.id]
      ) as { id: number } | null;

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

            if (Platform.OS === "android") {
              const { scheduleMedicineAlarm } = require("./medicineAlarmNative");
              const { getAnyLocalProfile } = require("../database/userProfileDB");
              const profile = await getAnyLocalProfile();
              const profileName = profile?.firstName
                ? `${profile.firstName} ${profile.lastName || ""}`.trim()
                : "You";

              const alarmTitle = `${med.name} (${profileName})`;
              const triggerTime = getNextTriggerTime(med.timestamp, freq);
              scheduleMedicineAlarm(
                med.id,
                alarmTitle,
                med.dose,
                triggerTime,
                freq
              );
              notifId = String(med.id);
            } else {
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
        if (!med || !med.id || !med.name || !med.name.trim()) continue;
        const deterministicId = `med_${memberId}_${med.id}`;

        if (med.reminder) {
          activeMedNotifIds.add(deterministicId);

          if (Platform.OS === "android") {
            try {
              const { scheduleMedicineAlarm } = require("./medicineAlarmNative");
              const alarmTitle = `${med.name} (${profileName})`;
              const freq = (med.frequency ?? "").toLowerCase();
              const triggerTime = getNextTriggerTime(med.timestamp, freq);
              
              scheduleMedicineAlarm(
                med.id,
                alarmTitle,
                med.dose,
                triggerTime,
                freq
              );
              log(`🔔 Scheduled native alarm for ${profileName}'s medicine: ${med.name}`);
            } catch (err) {
              log(`❌ Failed to schedule native medicine ${med.name} for ${profileName}:`, err);
            }
          } else {
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
        } else {
          // If reminder is off, cancel it
          if (Platform.OS === "android") {
            try {
              const { cancelMedicineAlarm } = require("./medicineAlarmNative");
              cancelMedicineAlarm(med.id);
            } catch (err) {
              log(`❌ Failed to cancel native alarm for ${profileName}'s medicine: ${med.name}`, err);
            }
          }
        }
      }

      // Clean up orphaned or turned-off alarms for this member
      if (Platform.OS === "android") {
        const { cancelMedicineAlarm } = require("./medicineAlarmNative");
        const cacheKey = `family_med_ids_${memberId}`;
        try {
          const cachedIdsStr = await AsyncStorage.getItem(cacheKey);
          const cachedIds: number[] = cachedIdsStr ? JSON.parse(cachedIdsStr) : [];
          
          for (const cachedId of cachedIds) {
            // If it was scheduled before, but is no longer in active meds, cancel it!
            if (!activeMedNotifIds.has(`med_${memberId}_${cachedId}`)) {
              log(`🗑 Cancelling deleted native alarm for ${profileName}: med_${memberId}_${cachedId}`);
              cancelMedicineAlarm(cachedId);
            }
          }
          
          // Save new scheduled IDs
          const newScheduledIds = meds
            .filter((m: any) => m && m.id && m.reminder)
            .map((m: any) => m.id);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(newScheduledIds));
        } catch (err) {
          log(`⚠️ Failed to clean up deleted native alarms for ${profileName}:`, err);
        }
      } else {
        for (const t of triggers) {
          const notifId = t.notification.id;
          if (notifId && notifId.startsWith(`med_${memberId}_`) && !activeMedNotifIds.has(notifId)) {
            log(`🗑 Cancelling orphaned notification for ${profileName}: ${notifId}`);
            await cancelMedicineNotification(notifId).catch(() => {});
          }
        }
      }
    }
    log("✅ Finished sync & reschedule pass for all family members.");
  } catch (err) {
    log("❌ Error in syncAndScheduleAllFamilyMedicines:", err);
  }
}