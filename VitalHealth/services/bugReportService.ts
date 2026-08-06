// services/bugReportService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Production-grade User Bug Reporting & System Diagnostics Service for VitalHealth
// ─────────────────────────────────────────────────────────────────────────────

import { Platform, Dimensions, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getBiogearsBaseUrl } from "./biogears";

export type BugCategory = "ui" | "vitals" | "ai" | "sync" | "crash" | "feedback";
export type BugSeverity = "low" | "medium" | "high" | "critical";

export interface BugReportPayload {
  category?: BugCategory;
  severity?: BugSeverity;
  summary: string;
  description: string;
  userEmail?: string;
  screenshotUri?: string;
  screenshotBase64?: string;
  includeDiagnostics?: boolean;
  stackTrace?: string;
  currentRoute?: string;
  profileId?: string;
}

export interface SystemDiagnostics {
  appVersion: string;
  platform: string;
  osVersion: string | number;
  screenSize: string;
  timestamp: string;
  serverUrl: string;
  currentRoute: string;
  profileId?: string;
}

const APP_VERSION = "2.4.1";
const DEFAULT_BUG_EMAIL = "vitalhealth1215@gmail.com";
export const DEFAULT_DISCORD_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1534826624946540636/b6qdlYQv-6OToaT8PASQLSKbVRaKRadPTCcN_vxR1WNnPHCxZDiZiYiPj4q-HTNOou4K";
const STORAGE_KEY_WEBHOOK = "VITAL_BUG_WEBHOOK_URL";
const STORAGE_KEY_HISTORY = "VITAL_BUG_REPORTS_HISTORY";

/**
 * Utility to redact IP addresses from URLs for privacy and security
 */
export function maskServerIp(rawUrl: string): string {
  if (!rawUrl || rawUrl === "Not connected" || rawUrl === "Unknown") return rawUrl;
  try {
    const u = new URL(rawUrl);
    const isIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(u.hostname) || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (isIp) {
      const portStr = u.port ? `:${u.port}` : '';
      return `${u.protocol}//[REDACTED_IP]${portStr}`;
    }
    return rawUrl;
  } catch {
    return rawUrl.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]');
  }
}

/**
 * Gathers non-sensitive system environment diagnostics
 */
export async function getSystemDiagnostics(
  currentRoute: string = "Unknown",
  profileId?: string
): Promise<SystemDiagnostics> {
  const { width, height } = Dimensions.get("window");
  let serverUrl = "Unknown";
  try {
    const rawUrl = await getBiogearsBaseUrl();
    serverUrl = maskServerIp(rawUrl);
  } catch {
    serverUrl = "Not connected";
  }

  return {
    appVersion: APP_VERSION,
    platform: Platform.OS,
    osVersion: Platform.Version,
    screenSize: `${Math.round(width)}x${Math.round(height)}`,
    timestamp: new Date().toISOString(),
    serverUrl,
    currentRoute,
    profileId: profileId || "Anon-User",
  };
}

/**
 * Formats a clean Markdown payload for Discord / Slack / Webhooks
 */
function formatWebhookPayload(
  payload: BugReportPayload,
  diag: SystemDiagnostics
) {
  const cat = payload.category || "ui";
  const sev = payload.severity || "medium";

  const severityEmoji: Record<BugSeverity, string> = {
    low: "🟢 Low",
    medium: "🟡 Medium",
    high: "🔴 High",
    critical: "💥 CRITICAL / CRASH",
  };

  const categoryEmoji: Record<BugCategory, string> = {
    ui: "🎨 UI / Design",
    vitals: "🩺 Vitals & Sensors",
    ai: "🧠 AI Health Twin",
    sync: "🔄 Sync & Storage",
    crash: "💥 App Crash",
    feedback: "💡 Feedback / Feature",
  };

  let content = `🐛 **[VitalHealth User Bug Report]**\n`;
  content += `> **Category:** ${categoryEmoji[cat]}\n`;
  content += `> **Severity:** ${severityEmoji[sev]}\n`;
  content += `> **Title:** ${payload.summary}\n\n`;
  content += `**Description:**\n${payload.description}\n\n`;

  if (payload.userEmail) {
    content += `**User Contact:** ${payload.userEmail}\n`;
  }

  if (payload.screenshotUri || payload.screenshotBase64) {
    content += `🖼️ **Screenshot Attached:** Yes\n`;
  }

  if (payload.includeDiagnostics !== false) {
    content += `\n📋 **System Diagnostics:**\n`;
    content += `• **App Version:** ${diag.appVersion}\n`;
    content += `• **OS Platform:** ${diag.platform} (v${diag.osVersion})\n`;
    content += `• **Screen:** ${diag.screenSize}\n`;
    content += `• **Route:** ${diag.currentRoute}\n`;
    content += `• **Server:** ${diag.serverUrl}\n`;
    content += `• **Timestamp:** ${diag.timestamp}\n`;
  }

  if (payload.stackTrace) {
    content += `\n🚨 **Stack Trace / Error:**\n\`\`\`\n${payload.stackTrace.slice(
      0,
      1000
    )}\n\`\`\`\n`;
  }

  return {
    username: "VitalHealth Support Bot",
    avatar_url: "https://vitalhealth.app/assets/icon.png",
    content,
  };
}

/**
 * Saves bug report entry to local storage history
 */
async function saveToLocalHistory(payload: BugReportPayload, diag: SystemDiagnostics) {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_HISTORY);
    const history = raw ? JSON.parse(raw) : [];
    history.unshift({
      id: `bug-${Date.now()}`,
      summary: payload.summary,
      category: payload.category || "ui",
      severity: payload.severity || "medium",
      hasScreenshot: Boolean(payload.screenshotUri || payload.screenshotBase64),
      timestamp: diag.timestamp,
    });
    // Keep last 20 reports
    await AsyncStorage.setItem(
      STORAGE_KEY_HISTORY,
      JSON.stringify(history.slice(0, 20))
    );
  } catch (err) {
    console.warn("Failed to save local bug report history:", err);
  }
}

/**
 * Dispatches a user bug report via Backend API, Webhook POST, or Mailto Fallback
 */
export async function submitBugReport(
  payload: BugReportPayload
): Promise<{ success: boolean; method: "server" | "webhook" | "email"; message: string }> {
  const diag = await getSystemDiagnostics(payload.currentRoute, payload.profileId);
  await saveToLocalHistory(payload, diag);

  const finalCat = payload.category || "ui";
  const finalSev = payload.severity || "medium";

  // 1. Primary Option: Dispatch to Backend Server API endpoint (/api/v1/bug-reports)
  let rawServerUrl = "";
  try {
    rawServerUrl = await getBiogearsBaseUrl();
  } catch {
    rawServerUrl = "";
  }

  if (rawServerUrl && rawServerUrl.startsWith("http")) {
    try {
      const serverEndpoint = `${rawServerUrl.replace(/\/+$/, "")}/api/v1/bug-reports`;
      const res = await fetch(serverEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: finalCat,
          severity: finalSev,
          summary: payload.summary,
          description: payload.description,
          user_email: payload.userEmail,
          screenshot_base64: payload.screenshotBase64,
          include_diagnostics: payload.includeDiagnostics ?? true,
          stack_trace: payload.stackTrace,
          current_route: payload.currentRoute,
          profile_id: payload.profileId,
          diagnostics: diag,
        }),
      });

      if (res.ok) {
        return {
          success: true,
          method: "server",
          message: "Bug report submitted successfully to backend server!",
        };
      }
    } catch (err) {
      console.warn("Backend server bug submit failed, trying Webhook/Email fallback:", err);
    }
  }

  // 2. Secondary Option: Custom Webhook (Discord / Slack)
  const customWebhook = await AsyncStorage.getItem(STORAGE_KEY_WEBHOOK);
  const webhookUrl = (customWebhook && customWebhook.trim()) || DEFAULT_DISCORD_WEBHOOK_URL;

  if (webhookUrl && webhookUrl.trim().startsWith("http")) {
    try {
      const body = formatWebhookPayload(payload, diag);
      const res = await fetch(webhookUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return {
          success: true,
          method: "webhook",
          message: "Bug report submitted successfully to beta team!",
        };
      }
    } catch (err) {
      console.warn("Webhook submit failed, using email fallback:", err);
    }
  }

  // 3. Fallback Option: Native Email
  const subject = encodeURIComponent(
    `[VitalHealth User Bug] [${finalCat.toUpperCase()}] ${payload.summary}`
  );
  
  let bodyText = `Category: ${finalCat}\nSeverity: ${finalSev}\n`;
  bodyText += `Summary: ${payload.summary}\n\nDescription:\n${payload.description}\n\n`;
  if (payload.userEmail) bodyText += `Contact: ${payload.userEmail}\n\n`;

  if (payload.includeDiagnostics !== false) {
    bodyText += `--- System Diagnostics ---\nApp Version: ${diag.appVersion}\nPlatform: ${diag.platform} v${diag.osVersion}\nScreen: ${diag.screenSize}\nRoute: ${diag.currentRoute}\nServer: ${diag.serverUrl}\nTime: ${diag.timestamp}\n`;
  }
  if (payload.stackTrace) {
    bodyText += `\n--- Stack Trace ---\n${payload.stackTrace}\n`;
  }

  const mailtoUrl = `mailto:${DEFAULT_BUG_EMAIL}?subject=${subject}&body=${encodeURIComponent(
    bodyText
  )}`;

  try {
    const canOpen = await Linking.canOpenURL(mailtoUrl);
    if (canOpen) {
      await Linking.openURL(mailtoUrl);
      return {
        success: true,
        method: "email",
        message: "Opening email app to send bug report...",
      };
    }
  } catch (err) {
    console.error("Email fallback failed:", err);
  }

  return {
    success: false,
    method: "server",
    message: "Unable to dispatch bug report automatically. Please email vitalhealth1215@gmail.com",
  };
}
