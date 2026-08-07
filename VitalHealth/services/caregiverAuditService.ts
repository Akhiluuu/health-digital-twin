// VitalHealth/services/caregiverAuditService.ts
// Audit trail logging system tracking profile switches and caregiver access events

import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { getUserId } from "./firebaseSync";
import { log, warn } from "../utils/logger";

const AUDIT_STORAGE_KEY = "vitalhealth_caregiver_audit_logs";

export interface AuditEvent {
  timestamp: number;
  operatorUid: string;
  targetProfileUid: string;
  action: "PROFILE_SWITCH_IN" | "PROFILE_SWITCH_OUT" | "LOG_VITALS" | "ADD_MEDICATION" | "UPDATE_DIET";
  metadata?: Record<string, any>;
}

export class CaregiverAuditService {
  /**
   * Logs a caregiver interaction event locally and asynchronously syncs to Firestore audit collection.
   */
  static async logEvent(
    targetProfileUid: string,
    action: AuditEvent["action"],
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const operatorUid = (await getUserId()) || "unknown_operator";
      const event: AuditEvent = {
        timestamp: Date.now(),
        operatorUid,
        targetProfileUid: targetProfileUid || "self",
        action,
        metadata,
      };

      log(`[CaregiverAuditService] 📋 Audit Event: ${action} | Operator: ${operatorUid} -> Target: ${targetProfileUid}`);

      // 1. Local append
      const existingRaw = await AsyncStorage.getItem(AUDIT_STORAGE_KEY);
      const logs: AuditEvent[] = existingRaw ? JSON.parse(existingRaw) : [];
      logs.unshift(event);
      // Keep max 100 recent audit events locally
      await AsyncStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs.slice(0, 100)));

      // 2. Async sync to Firestore
      if (operatorUid && operatorUid !== "unknown_operator") {
        addDoc(collection(db, "audit_logs"), {
          ...event,
          createdAt: serverTimestamp(),
        }).catch((err) => {
          warn(`[CaregiverAuditService] Firestore audit sync warning:`, err);
        });
      }
    } catch (err) {
      warn(`[CaregiverAuditService] Failed logging audit event:`, err);
    }
  }

  /**
   * Retrieves local audit history for compliance review.
   */
  static async getLocalAuditLogs(): Promise<AuditEvent[]> {
    try {
      const raw = await AsyncStorage.getItem(AUDIT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}
