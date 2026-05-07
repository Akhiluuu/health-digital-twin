// database/userProfileDB.ts
// ─── Local mirror of the user's Firebase profile ─────────────────────────────
// Stores the user's identity so the app works fully offline and survives
// phone changes (pair with Google Drive backup to restore on new device).

import { db } from "./index";

export interface UserProfile {
  uid: string;
  firstName: string;
  lastName: string;
  inviteCode: string;
  bloodGroup: string;
  gender: string;
  dateOfBirth: string;
  height: number;
  weight: number;
  phone: string;
  profileImage: string;
  registered_at: string;
  biogears_registered: number;  // 0 = not yet, 1 = done
  biogears_user_id: string;
}

// ─── Upsert (insert or update) the local profile ─────────────────────────────

export async function saveUserProfile(profile: Partial<UserProfile> & { uid: string }): Promise<void> {
  try {
    await db.runAsync(
      `INSERT INTO user_profile
        (uid, firstName, lastName, inviteCode, bloodGroup, gender,
         dateOfBirth, height, weight, phone, profileImage,
         registered_at, biogears_registered, biogears_user_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(uid) DO UPDATE SET
         firstName           = excluded.firstName,
         lastName            = excluded.lastName,
         inviteCode          = excluded.inviteCode,
         bloodGroup          = excluded.bloodGroup,
         gender              = excluded.gender,
         dateOfBirth         = excluded.dateOfBirth,
         height              = excluded.height,
         weight              = excluded.weight,
         phone               = excluded.phone,
         profileImage        = excluded.profileImage,
         registered_at       = excluded.registered_at,
         biogears_registered = excluded.biogears_registered,
         biogears_user_id    = excluded.biogears_user_id
      `,
      [
        profile.uid,
        profile.firstName   ?? "",
        profile.lastName    ?? "",
        profile.inviteCode  ?? "",
        profile.bloodGroup  ?? "",
        profile.gender      ?? "",
        profile.dateOfBirth ?? "",
        profile.height      ?? 0,
        profile.weight      ?? 0,
        profile.phone       ?? "",
        profile.profileImage ?? "",
        profile.registered_at ?? new Date().toISOString(),
        profile.biogears_registered ?? 0,
        profile.biogears_user_id ?? "",
      ]
    );
    console.log("✅ User profile saved locally:", profile.uid);
  } catch (error) {
    console.log("❌ saveUserProfile error:", error);
  }
}

// ─── Get stored local profile ─────────────────────────────────────────────────

export async function getLocalProfile(uid: string): Promise<UserProfile | null> {
  try {
    return (await db.getFirstAsync<UserProfile>(
      "SELECT * FROM user_profile WHERE uid = ?",
      [uid]
    )) ?? null;
  } catch (error) {
    console.log("❌ getLocalProfile error:", error);
    return null;
  }
}

// ─── Get any stored profile (first row — for single-user apps) ────────────────

export async function getAnyLocalProfile(): Promise<UserProfile | null> {
  try {
    return (await db.getFirstAsync<UserProfile>(
      "SELECT * FROM user_profile ORDER BY registered_at DESC LIMIT 1"
    )) ?? null;
  } catch (error) {
    console.log("❌ getAnyLocalProfile error:", error);
    return null;
  }
}

// ─── Mark BioGears as registered ─────────────────────────────────────────────

export async function markBiogearsRegistered(uid: string, biogearsUserId: string): Promise<void> {
  try {
    await db.runAsync(
      "UPDATE user_profile SET biogears_registered = 1, biogears_user_id = ? WHERE uid = ?",
      [biogearsUserId, uid]
    );
  } catch (error) {
    console.log("❌ markBiogearsRegistered error:", error);
  }
}

// ─── Delete profile (e.g. on logout) ─────────────────────────────────────────

export async function deleteLocalProfile(uid: string): Promise<void> {
  try {
    await db.runAsync("DELETE FROM user_profile WHERE uid = ?", [uid]);
    console.log("🗑 Local profile deleted:", uid);
  } catch (error) {
    console.log("❌ deleteLocalProfile error:", error);
  }
}
