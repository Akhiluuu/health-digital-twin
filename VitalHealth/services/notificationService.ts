// services/notificationService.ts

import { addWaterFromNotification } from "../context/HydrationContext";
import { log, warn } from "../utils/logger";
import { NativeModules } from "react-native";
import {
  CHANNEL_EMERGENCY,
  CHANNEL_MEDICATION,
  CHANNEL_VITALS,
  CHANNEL_LABS,
  CHANNEL_JOURNEY,
  CHANNEL_CARE,
  CHANNEL_WELLNESS,
  CHANNEL_ID,
  getFormattedTitle,
  getProfileInfo,
} from "./notifeeService";

////////////////////////////////////////////////////////////
// SAFE NOTIFEE IMPORT (won't crash in Expo Go)
////////////////////////////////////////////////////////////

let notifee: any = null;
let AndroidImportance: any = { HIGH: 4, DEFAULT: 3 };
let TriggerType: any = { TIMESTAMP: 0 };
let EventType: any = { ACTION_PRESS: 2 };

if (Boolean(NativeModules?.NotifeeApiModule)) {
  try {
    const notifeeModule = require("@notifee/react-native");
    notifee = notifeeModule.default;
    AndroidImportance = notifeeModule.AndroidImportance;
    TriggerType = notifeeModule.TriggerType;
    EventType = notifeeModule.EventType;
    log("✅ Notifee loaded successfully");
  } catch (error) {
    warn("⚠️ Notifee not available — notifications disabled (Expo Go)");
  }
}

const isNotifeeAvailable = () => {
  if (!notifee) {
    warn("⚠️ Notifee not available, skipping...");
    return false;
  }
  return true;
};

export const cancelMedicineNotification = async (notificationId: string) => {
  if (!isNotifeeAvailable()) return;
  try {
    if (!notificationId) return;
    await notifee.cancelNotification(notificationId);
    log("🔕 Notification cancelled:", notificationId);
  } catch (error) {
    log("❌ Cancel notification error:", error);
  }
};

export const requestPermission = async () => {
  if (!isNotifeeAvailable()) return;
  await notifee.requestPermission();
};

////////////////////////////////////////////////////////////
// EXPANDED 30+ NOTIFICATION FACTORIES
////////////////////////////////////////////////////////////

// 1. 🚨 EMERGENCY & TRIAGE
export const triggerEmergencyTriageAlert = async (
  profileId: string = "self",
  profileName: string = "",
  symptom: string = "Severe Symptom"
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle("🚨 Emergency Triage Alert", profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `Red flag symptom detected: ${symptom}. Immediate clinical care recommended.`,
    data: {
      type: "emergency",
      profileId,
      deepLinkUrl: "/emergency",
      symptom,
    },
    android: {
      channelId: CHANNEL_EMERGENCY,
      pressAction: { id: "default" },
      actions: [
        { title: "📞 Call 911", pressAction: { id: "EMERGENCY_CALL", launchActivity: "none" } },
        { title: "🗺️ Nearest ER", pressAction: { id: "EMERGENCY_MAP", launchActivity: "none" } },
      ],
    },
  });
};

// 2. 🫀 DIGITAL TWIN VITALS
export const triggerVitalsAnomalyAlert = async (
  profileId: string = "self",
  profileName: string = "",
  vitalName: string = "Resting Heart Rate",
  value: string = "110 bpm",
  baseline: string = "Uncalibrated"
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle(`🫀 ${vitalName} Anomaly`, profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `Logged ${vitalName}: ${value} (Baseline: ${baseline}). BioGears twin recommends rest.`,
    data: {
      type: "vitals",
      profileId,
      deepLinkUrl: "/(tabs)/insights",
      vitalName,
      value,
    },
    android: {
      channelId: CHANNEL_VITALS,
      pressAction: { id: "default" },
      actions: [
        { title: "📊 View Twin", pressAction: { id: "VIEW_TWIN", launchActivity: "none" } },
        { title: "🧘 Calm Breath", pressAction: { id: "BREATHE_EXERCISE", launchActivity: "none" } },
      ],
    },
  });
};

export const triggerBloodPressureAlert = async (
  profileId: string = "self",
  profileName: string = "",
  bpString: string = "140/90"
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle("🩸 Blood Pressure Alert", profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `Blood pressure reading of ${bpString} mmHg is elevated. Avoid heavy max-effort weightlifting.`,
    data: { type: "vitals", profileId, deepLinkUrl: "/(tabs)/insights", bpString },
    android: {
      channelId: CHANNEL_VITALS,
      pressAction: { id: "default" },
      actions: [
        { title: "🩺 Symptoms", pressAction: { id: "CHECK_SYMPTOMS", launchActivity: "none" } },
        { title: "📊 BP Log", pressAction: { id: "VIEW_BP_LOG", launchActivity: "none" } },
      ],
    },
  });
};

export const triggerFastingGlucoseAlert = async (
  profileId: string = "self",
  profileName: string = "",
  glucoseMgDl: number = 142
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle("📉 Fasting Glucose Spike", profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `Fasting glucose logged at ${glucoseMgDl} mg/dL. A 10-minute walk helps lower post-meal glucose.`,
    data: { type: "vitals", profileId, deepLinkUrl: "/(tabs)/insights", glucoseMgDl },
    android: {
      channelId: CHANNEL_VITALS,
      pressAction: { id: "default" },
      actions: [
        { title: "🏃 Log Walk", pressAction: { id: "LOG_WALK", launchActivity: "none" } },
        { title: "🥗 Diet Tips", pressAction: { id: "VIEW_DIET", launchActivity: "none" } },
      ],
    },
  });
};

// 3. 🧪 LAB OCR & DIAGNOSTICS
export const triggerLabScanCompleteAlert = async (
  profileId: string = "self",
  profileName: string = "",
  labTitle: string = "Blood Panel",
  summaryText: string = "eGFR 48 mL/min (Stage 3a CKD Stable)"
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle(`🧪 ${labTitle} Scanned`, profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `OCR Analysis Complete: ${summaryText}. Tap to read full clinical summary.`,
    data: { type: "lab", profileId, deepLinkUrl: "/lab-summary", labTitle },
    android: {
      channelId: CHANNEL_LABS,
      pressAction: { id: "default" },
      actions: [{ title: "📄 View Summary", pressAction: { id: "VIEW_LAB_SUMMARY", launchActivity: "none" } }],
    },
  });
};

export const triggerAbnormalLabValueAlert = async (
  profileId: string = "self",
  profileName: string = "",
  labTitle: string = "HbA1c Panel",
  abnormalText: string = "HbA1c 7.4% (Target: < 7.0%)"
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle("⚠️ Lab Result Attention", profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `Attention needed for ${labTitle}: ${abnormalText}. Review recommended clinical steps.`,
    data: { type: "lab", profileId, deepLinkUrl: "/lab-summary" },
    android: {
      channelId: CHANNEL_LABS,
      pressAction: { id: "default" },
      actions: [{ title: "🔍 Read Guidance", pressAction: { id: "VIEW_LAB_GUIDANCE", launchActivity: "none" } }],
    },
  });
};

export const triggerPreventiveScreeningAlert = async (
  profileId: string = "self",
  profileName: string = "",
  screeningName: string = "Mammogram & DEXA Scan"
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle("🎗️ Annual Preventive Care Reminder", profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `Your annual ${screeningName} is due this month. Contact your doctor to schedule.`,
    data: { type: "lab", profileId, deepLinkUrl: "/preventive-care" },
    android: {
      channelId: CHANNEL_LABS,
      pressAction: { id: "default" },
      actions: [{ title: "📅 Schedule", pressAction: { id: "SCHEDULE_SCREENING", launchActivity: "none" } }],
    },
  });
};

// 4. 🎯 HEALTH JOURNEY & MILESTONES
export const triggerJourneyMilestoneAlert = async (
  profileId: string = "self",
  profileName: string = "",
  milestoneTitle: string = "30-Day Glycemic Control",
  description: string = "Maintained HbA1c trajectory below 6.5%!"
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle("🎯 Milestone Reached!", profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `Unlocked Milestone: '${milestoneTitle}'. ${description}`,
    data: { type: "journey", profileId, deepLinkUrl: "/journey/milestones" },
    android: {
      channelId: CHANNEL_JOURNEY,
      pressAction: { id: "default" },
      actions: [{ title: "🎉 Celebrate", pressAction: { id: "VIEW_MILESTONE", launchActivity: "none" } }],
    },
  });
};

export const triggerJourneyStreakAlert = async (
  profileId: string = "self",
  profileName: string = "",
  daysCount: number = 7
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle(`🔥 ${daysCount}-Day Adherence Streak`, profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `You logged medications & vitals ${daysCount} days in a row! Excellent consistency.`,
    data: { type: "journey", profileId, deepLinkUrl: "/journey/timeline" },
    android: {
      channelId: CHANNEL_JOURNEY,
      pressAction: { id: "default" },
      actions: [{ title: "🔥 View Streak", pressAction: { id: "VIEW_STREAK", launchActivity: "none" } }],
    },
  });
};

export const triggerJourneyShiftAlert = async (
  profileId: string = "self",
  profileName: string = "",
  shiftSummary: string = "6-Month HbA1c dropped from 7.4% to 6.2%"
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle("📈 Trajectory Shift Detected", profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `Longitudinal Trajectory Shift: ${shiftSummary}. Keep up the great work!`,
    data: { type: "journey", profileId, deepLinkUrl: "/journey/insights" },
    android: {
      channelId: CHANNEL_JOURNEY,
      pressAction: { id: "default" },
      actions: [{ title: "📈 View Chart", pressAction: { id: "VIEW_TRAJECTORY_CHART", launchActivity: "none" } }],
    },
  });
};

export const triggerDoctorPrepAlert = async (
  profileId: string = "self",
  profileName: string = "",
  specialty: string = "Cardiology"
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle(`👨‍⚕️ ${specialty} Appointment Prep`, profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `Your ${specialty} visit is in 2 days. Check your auto-generated clinical question checklist.`,
    data: { type: "journey", profileId, deepLinkUrl: "/journey/doctor-view" },
    android: {
      channelId: CHANNEL_JOURNEY,
      pressAction: { id: "default" },
      actions: [{ title: "📋 Doctor List", pressAction: { id: "VIEW_DOCTOR_LIST", launchActivity: "none" } }],
    },
  });
};

// 5. 👥 CARE CIRCLE & MULTI-PROFILE
export const triggerCareCircleMedTakenAlert = async (
  memberProfileId: string,
  memberName: string,
  medName: string
) => {
  if (!isNotifeeAvailable()) return;
  const title = `[Care Circle] 💊 ${memberName} Took Medication`;
  await notifee.displayNotification({
    title,
    body: `${memberName} logged ${medName} as TAKEN.`,
    data: { type: "care_circle", profileId: memberProfileId, deepLinkUrl: "/care-circle" },
    android: {
      channelId: CHANNEL_CARE,
      pressAction: { id: "default" },
      actions: [{ title: "💬 Send 👍", pressAction: { id: "SEND_REASSURANCE", launchActivity: "none" } }],
    },
  });
};

export const triggerCareCircleMedMissedAlert = async (
  memberProfileId: string,
  memberName: string,
  medName: string
) => {
  if (!isNotifeeAvailable()) return;
  const title = `[Care Circle] ⚠️ ${memberName} Missed Dose`;
  await notifee.displayNotification({
    title,
    body: `${memberName} missed their scheduled dose of ${medName}.`,
    data: { type: "care_circle", profileId: memberProfileId, deepLinkUrl: "/care-circle" },
    android: {
      channelId: CHANNEL_CARE,
      pressAction: { id: "default" },
      actions: [{ title: "📞 Remind", pressAction: { id: "REMIND_MEMBER", launchActivity: "none" } }],
    },
  });
};

export const triggerCareCircleEmergencyAlert = async (
  memberProfileId: string,
  memberName: string,
  symptom: string
) => {
  if (!isNotifeeAvailable()) return;
  const title = `[Care Circle] 🚨 Emergency Alert for ${memberName}`;
  await notifee.displayNotification({
    title,
    body: `Emergency triage triggered for ${memberName}: ${symptom}. Please check immediately.`,
    data: { type: "care_circle", profileId: memberProfileId, deepLinkUrl: "/care-circle" },
    android: {
      channelId: CHANNEL_EMERGENCY,
      pressAction: { id: "default" },
      actions: [{ title: "📞 Call Member", pressAction: { id: "CALL_MEMBER", launchActivity: "none" } }],
    },
  });
};

// 6. 💊 MEDICATION REFILL & INTERACTIONS
export const triggerMedicationRefillLowAlert = async (
  profileId: string = "self",
  profileName: string = "",
  medName: string = "Metformin",
  daysLeft: number = 3
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle("📦 Low Medication Inventory", profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `Only ${daysLeft} days of ${medName} remaining in your pill vault. Tap to request refill.`,
    data: { type: "medicine", profileId, deepLinkUrl: "/(tabs)/medicine" },
    android: {
      channelId: CHANNEL_MEDICATION,
      pressAction: { id: "default" },
      actions: [{ title: "📦 Request Refill", pressAction: { id: "REFILL_RX", launchActivity: "none" } }],
    },
  });
};

export const triggerDrugInteractionAlert = async (
  profileId: string = "self",
  profileName: string = "",
  med1: string = "Ibuprofen",
  med2: string = "Apixaban"
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle("🛑 Drug Interaction Risk Warning", profileId, profileName);
  await notifee.displayNotification({
    title,
    body: `Potential interaction detected between ${med1} and ${med2}. Tap to read safety guidance.`,
    data: { type: "medicine", profileId, deepLinkUrl: "/med-vault/interaction" },
    android: {
      channelId: CHANNEL_MEDICATION,
      pressAction: { id: "default" },
      actions: [{ title: "⚠️ Read Warning", pressAction: { id: "VIEW_INTERACTION_WARNING", launchActivity: "none" } }],
    },
  });
};

// 7. 💧 LIFESTYLE & DAILY WELLNESS
export const triggerPostMealWalkReminder = async (
  profileId: string = "self",
  profileName: string = ""
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle("🏃 10-Minute Post-Meal Walk", profileId, profileName);
  await notifee.displayNotification({
    title,
    body: "A short 10-minute walk after eating helps lower postprandial glucose spikes by up to 25%.",
    data: { type: "wellness", profileId, deepLinkUrl: "/step-counter" },
    android: {
      channelId: CHANNEL_WELLNESS,
      pressAction: { id: "default" },
      actions: [{ title: "⏱️ Start Walk", pressAction: { id: "START_WALK", launchActivity: "none" } }],
    },
  });
};

export const triggerBedtimeWinddownReminder = async (
  profileId: string = "self",
  profileName: string = ""
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle("🌙 Bedtime Winddown Routine", profileId, profileName);
  await notifee.displayNotification({
    title,
    body: "Bedtime in 60 minutes. Turn off bright screens to support synaptic consolidation & sleep.",
    data: { type: "wellness", profileId, deepLinkUrl: "/rest" },
    android: {
      channelId: CHANNEL_WELLNESS,
      pressAction: { id: "default" },
      actions: [{ title: "🌙 Start Rest Mode", pressAction: { id: "START_REST_MODE", launchActivity: "none" } }],
    },
  });
};

export const triggerMorningBriefingAlert = async (
  profileId: string = "self",
  profileName: string = ""
) => {
  if (!isNotifeeAvailable()) return;
  const title = await getFormattedTitle("🌅 Morning Health Briefing", profileId, profileName);
  await notifee.displayNotification({
    title,
    body: "Good morning! Your digital twin physiological state is 100% synced. View today's care plan.",
    data: { type: "wellness", profileId, deepLinkUrl: "/(tabs)/home" },
    android: {
      channelId: CHANNEL_WELLNESS,
      pressAction: { id: "default" },
      actions: [{ title: "📖 Read Briefing", pressAction: { id: "READ_BRIEFING", launchActivity: "none" } }],
    },
  });
};

////////////////////////////////////////////////////////////
// FOREGROUND ACTION EVENT LISTENER
////////////////////////////////////////////////////////////

if (notifee) {
  notifee.onForegroundEvent(async ({ type, detail }: any) => {
    if (type === EventType.ACTION_PRESS) {
      const actionId = detail.pressAction?.id;
      log("🔔 Foreground Notification Action Pressed:", actionId);

      if (actionId === "HYDRATION_100") {
        log("💧 Adding 100ml water");
        addWaterFromNotification(100);
      } else if (actionId === "HYDRATION_200") {
        log("💧 Adding 200ml water");
        addWaterFromNotification(200);
      }
    }
  });
}

export const scheduleNotification = async (
  title: string,
  body: string,
  type: string = "system",
  timestamp?: number,
  data?: any
) => {
  if (!isNotifeeAvailable()) return;
  try {
    const id = `notif_${Date.now()}`;
    if (timestamp && timestamp > Date.now()) {
      await notifee.createTriggerNotification(
        {
          id,
          title,
          body,
          data: { type, ...(data || {}) },
          android: { channelId: CHANNEL_WELLNESS, pressAction: { id: "default" } },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp,
        }
      );
    } else {
      await notifee.displayNotification({
        id,
        title,
        body,
        data: { type, ...(data || {}) },
        android: { channelId: CHANNEL_WELLNESS, pressAction: { id: "default" } },
      });
    }
    return id;
  } catch (err) {
    warn("❌ Error in scheduleNotification:", err);
  }
};

export const showHealthNotification = scheduleNotification;

export default notifee;