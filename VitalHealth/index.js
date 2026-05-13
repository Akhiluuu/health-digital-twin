// index.js — root of project (same level as package.json)

import { AppRegistry } from "react-native";
import App from "./App";
import { name as appName } from "./app.json";

import notifee, { EventType } from "@notifee/react-native";

import {
  handleMedicineTaken,
  snoozeMedicine,
  scheduleHydrationReminder,
} from "./services/notifeeService";

import { saveWaterToStorage } from "./utils/hydrationStorage";

///////////////////////////////////////////////////////////
// BACKGROUND HANDLER
// Runs in headless JS when app is killed or backgrounded.
///////////////////////////////////////////////////////////

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type !== EventType.ACTION_PRESS) return;

  const action     = detail.pressAction?.id;
  const notifId    = detail.notification?.id ?? "";
  const data       = detail.notification?.data ?? {};
  // ✅ FIX: Extract medicineId from notification data.
  //    When a snooze notification fires, its notifId is new (snooze_xxx)
  //    and won't match any notificationId in SQLite. But medicineId is
  //    always carried through the data payload so we can look up by that.
  const medicineId = String(data.medicineId ?? "");

  console.log("🔔 Background Action:", action, "notifId:", notifId, "medicineId:", medicineId);

  // ── Medicine: Taken ─────────────────────────────────────────
  if (action === "MEDICINE_TAKEN") {
    // Pass both notifId AND medicineId — handleMedicineTaken uses
    // medicineId as a fallback when notifId lookup returns null
    await handleMedicineTaken(notifId, medicineId);
    return;
  }

  // ── Medicine: Snooze ────────────────────────────────────────
  if (action === "MEDICINE_SNOOZE") {
    await snoozeMedicine(
      detail.notification?.body || "Medicine reminder",
      medicineId,
      String(data.frequency ?? "daily"),
      5
    );
    await notifee.cancelDisplayedNotification(notifId);
    return;
  }

  // ── Hydration ───────────────────────────────────────────────
  if (
    action === "HYDRATION_100" ||
    action === "HYDRATION_150" ||
    action === "HYDRATION_200"
  ) {
    const ml =
      action === "HYDRATION_100" ? 100
      : action === "HYDRATION_150" ? 150
      : 200;
    await saveWaterToStorage(ml);
    await scheduleHydrationReminder();
    await notifee.cancelDisplayedNotification(notifId);
    return;
  }

  if (action === "HYDRATION_SNOOZE") {
    await scheduleHydrationReminder();
    await notifee.cancelDisplayedNotification(notifId);
    return;
  }

  // Default dismiss
  if (notifId) await notifee.cancelDisplayedNotification(notifId);
});

///////////////////////////////////////////////////////////
// APP REGISTRATION
///////////////////////////////////////////////////////////

AppRegistry.registerComponent(appName, () => App);