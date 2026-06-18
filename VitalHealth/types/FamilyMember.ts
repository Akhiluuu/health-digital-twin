/**
 * 📁 FamilyMember.ts
 * Defines all types related to family health monitoring.
 * Compatible with Firebase, AsyncStorage, and Expo Router navigation.
 */

/* ──────────────────────────────────────────────────────────────
   Medicine Interface
   ────────────────────────────────────────────────────────────── */
export interface Medicine {
  name: string;
  dosage?: string;
  frequency?: string;
  time?: string;
}

/* ──────────────────────────────────────────────────────────────
   Symptom Interface
   ────────────────────────────────────────────────────────────── */
export interface Symptom {
  name: string;
  severity?: "Mild" | "Moderate" | "Severe" | string;
  date?: string; // ISO format: YYYY-MM-DD
}

/* ──────────────────────────────────────────────────────────────
   Family Member Interface
   ────────────────────────────────────────────────────────────── */
export interface FamilyMember {
  /* 🔹 Unique Identifiers */
  id: string;      // Primary identifier (Firebase UID or local ID)
  uid: string;     // Firebase UID (REQUIRED for compatibility)
  userId?: string; // Alternative identifier for compatibility

  /* 🔹 Personal Information */
  firstName?: string;
  lastName?: string;
  name?: string;
  relation?: string;
  relationship?: string;
  gender?: string;

  /* 🔹 Date of Birth (Replaces Age) */
  dateOfBirth?: string; // Preferred field
  dob?: string;         // Backward compatibility
  age?: number | string; // Optional fallback

  /* 🔹 Physical Attributes */
  height?: number | string;
  weight?: number | string;
  bloodGroup?: string;

  /* 🔹 Vital Signs */
  heartRate?: number;
  spo2?: number;
  bloodPressure?: string;
  temperature?: number;

  /* 🔹 Lifestyle Metrics */
  hydration?: number;
  steps?: number;
  calories?: number;

  /* 🔹 Health Records */
  medicines?: Medicine[];
  symptoms?: Symptom[];

  /* 🔹 Metadata */
  profileImage?: string;
  inviteCode?: string;
  status?: "active" | "pending";
  phone?: string;
  isDependent?: boolean;
  managedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/* ──────────────────────────────────────────────────────────────
   Linked Member Compatibility Type
   ────────────────────────────────────────────────────────────── */
export interface LinkedMemberCompat {
  id?: string;
  uid?: string;
  userId?: string;
}

/**
 * A unified type for components that handle both
 * FamilyMember and Firebase-linked members.
 */
export type AnyMember = FamilyMember | LinkedMemberCompat;

/* ──────────────────────────────────────────────────────────────
   Utility Function
   ────────────────────────────────────────────────────────────── */
export const getFamilyMemberId = (member: AnyMember): string => {
  if ("id" in member && member.id) return member.id;
  if ("uid" in member && member.uid) return member.uid;
  if ("userId" in member && member.userId) return member.userId;

  throw new Error("Invalid family member: No ID found.");
};