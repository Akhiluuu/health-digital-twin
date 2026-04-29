// services/profileService.ts
// All profile read/write using Firebase Firestore
// Data syncs across ALL devices automatically

import { doc, getDoc, setDoc } from "firebase/firestore";
import { LinkedMember } from "./familySync";
import { auth, db } from "./firebase";

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  height: string;
  weight: string;
  allergies: string[];
  medications: string[];
  emergencyContact: {
    name: string;
    phone: string;
    relation: string;
  };
  profileImage?: string;
  inviteCode?: string;
  healthId?: string;
  linkedMembers?: Record<string, LinkedMember>;

  // ── BioGears Digital Twin clinical fields ────────────────────────────────
  // Baseline vitals
  biogears_resting_hr?: number;       // bpm, default 72
  biogears_systolic_bp?: number;      // mmHg, default 114
  biogears_diastolic_bp?: number;     // mmHg, default 73.5
  biogears_body_fat?: number;         // fraction 0–1, e.g. 0.20 = 20%
  // Clinical conditions
  biogears_is_smoker?: boolean;
  biogears_has_anemia?: boolean;
  biogears_has_type1_diabetes?: boolean;
  biogears_has_type2_diabetes?: boolean;
  biogears_hba1c?: number | null;     // Glycated haemoglobin % e.g. 7.2
  // Extended fields
  biogears_ethnicity?: string;        // 'South Asian' | 'Other'
  biogears_fitness_level?: string;    // 'sedentary' | 'active' | 'athlete'
  biogears_vo2max?: number | null;    // mL/kg/min
  // Registration status (local only — not synced to Firebase)
  biogears_registered?: boolean;      // whether twin has been calibrated
  biogears_registered_at?: string;    // ISO timestamp of last registration
}

////////////////////////////////////////////////////////////

// ✅ SAFE DEFAULT PROFILE (VERY IMPORTANT)
export const EMPTY_PROFILE: UserProfile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  gender: "",
  bloodGroup: "",
  height: "",
  weight: "",
  allergies: [],
  medications: [],
  emergencyContact: {
    name: "",
    phone: "",
    relation: "",
  },
  profileImage: "",
  inviteCode: "",
  healthId: "",
  linkedMembers: {},
  // BioGears defaults
  biogears_resting_hr: 72,
  biogears_systolic_bp: 114,
  biogears_diastolic_bp: 73.5,
  biogears_body_fat: 0.20,
  biogears_is_smoker: false,
  biogears_has_anemia: false,
  biogears_has_type1_diabetes: false,
  biogears_has_type2_diabetes: false,
  biogears_hba1c: null,
  biogears_ethnicity: 'Other',
  biogears_fitness_level: 'sedentary',
  biogears_vo2max: null,
  biogears_registered: false,
};

////////////////////////////////////////////////////////////

// ✅ FETCH PROFILE (SAFE VERSION)
export async function fetchProfile(uid?: string): Promise<UserProfile | null> {
  try {
    const userId = uid || auth.currentUser?.uid;

    if (!userId) {
      console.log("⚠️ fetchProfile: No logged in user");
      return null;
    }

    const docSnap = await getDoc(doc(db, "users", userId));

    if (docSnap.exists()) {
      const data = docSnap.data() as Partial<UserProfile>;

      // ✅ Merge with default → prevents undefined crashes
      const safeProfile: UserProfile = {
        ...EMPTY_PROFILE,
        ...data,
        emergencyContact: {
          ...EMPTY_PROFILE.emergencyContact,
          ...(data.emergencyContact || {}),
        },
        linkedMembers: data.linkedMembers || {},
      };

      console.log("✅ Profile fetched safely:", userId);
      return safeProfile;
    }

    console.log("ℹ️ No profile found in Firebase for", userId);
    return null;
  } catch (e) {
    console.log("❌ fetchProfile error:", e);
    return null;
  }
}

////////////////////////////////////////////////////////////

// ✅ SAVE FULL PROFILE
export async function saveProfile(profile: UserProfile): Promise<boolean> {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const fullProfile: UserProfile = {
      ...EMPTY_PROFILE,
      ...profile,
      emergencyContact: {
        ...EMPTY_PROFILE.emergencyContact,
        ...(profile.emergencyContact || {}),
      },
      inviteCode:
        profile.inviteCode ||
        `VT-${user.uid.substring(0, 4).toUpperCase()}-${user.uid
          .slice(-4)
          .toUpperCase()}`,
      healthId:
        profile.healthId ||
        `VT-${user.uid.substring(0, 4).toUpperCase()}-${user.uid
          .slice(-4)
          .toUpperCase()}`,
      linkedMembers: profile.linkedMembers || {},
    };

    await setDoc(
      doc(db, "users", user.uid),
      {
        ...fullProfile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log("✅ Profile saved:", fullProfile.firstName);
    return true;
  } catch (e) {
    console.log("❌ saveProfile error:", e);
    return false;
  }
}

////////////////////////////////////////////////////////////

// ✅ UPDATE PROFILE (SAFE MERGE UPDATE)
export async function updateProfile(
  partial: Partial<UserProfile>
): Promise<boolean> {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const safePartial: Partial<UserProfile> = {
      ...partial,
    };
    if (partial.emergencyContact) {
      safePartial.emergencyContact = {
        ...EMPTY_PROFILE.emergencyContact,
        ...partial.emergencyContact,
      };
    } else if (partial.emergencyContact === undefined) {
      delete safePartial.emergencyContact;
    }

    await setDoc(
      doc(db, "users", user.uid),
      {
        ...safePartial,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log("✅ Profile updated:", Object.keys(partial).join(", "));
    return true;
  } catch (e) {
    console.log("❌ updateProfile error:", e);
    return false;
  }
}