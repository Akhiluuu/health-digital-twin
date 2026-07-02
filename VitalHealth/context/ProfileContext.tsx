// context/ProfileContext.tsx
// Loads profile from AsyncStorage first (instant),
// then syncs from Firebase in background (when auth is ready)

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { auth } from "../services/firebase";
import { log } from "../utils/logger";

import {
  EMPTY_PROFILE,
  UserProfile,
  fetchProfile,
  saveProfile as firebaseSave,
  updateProfile as firebaseUpdate,
} from "../services/profileService";

interface ProfileContextType {
  profile:           UserProfile;
  isLoaded:          boolean;
  weightKg:          number;
  heightCm:          number;
  ageYears:          number;
  isProfileComplete: () => boolean;
  saveProfile:       (p: UserProfile) => Promise<void>;
  updateProfile:     (partial: Partial<UserProfile>) => Promise<void>;
  resetProfile:      () => Promise<void>;
  reloadProfile:     () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: EMPTY_PROFILE,
  isLoaded: false,
  weightKg: 0, heightCm: 0, ageYears: 0,
  isProfileComplete: () => false,
  saveProfile:   async () => {},
  updateProfile:  async () => {},
  resetProfile:   async () => {},
  reloadProfile:  async () => {},
});

function parseKg(raw: any): number {
  const n = parseFloat(String(raw || "").replace(/[^0-9.]/g, ""));
  return isNaN(n) || n <= 0 ? 0 : n;
}
function parseCm(raw: any): number {
  const n = parseFloat(String(raw || "").replace(/[^0-9.]/g, ""));
  return isNaN(n) || n <= 0 ? 0 : n;
}
function parseAge(dob: string): number {
  try {
    const age = Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    return age > 0 && age < 150 ? age : 30;
  } catch { return 30; }
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile,  setProfile]  = useState<UserProfile>(EMPTY_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);
  const isMountedRef = useRef(true);
  // Always keep a ref to the latest profile so async callbacks (updateProfile)
  // compose on the real current state even under rapid sequential calls.
  const profileRef = useRef<UserProfile>(EMPTY_PROFILE);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  const reloadProfile = useCallback(async () => {
    try {
      // ✅ STEP 1: Load from AsyncStorage instantly (no auth needed)
      const raw = await AsyncStorage.getItem("userProfile");
      if (raw && isMountedRef.current) {
        let local: UserProfile | null = null;
        try { local = JSON.parse(raw) as UserProfile; } catch { log('[ProfileContext] Corrupted profile cache, ignoring'); }
        if (local && typeof local === 'object' && local.email !== undefined) {
          setProfile({ ...EMPTY_PROFILE, ...local });
          log("✅ Profile loaded from AsyncStorage:", local.firstName, local.email);
        }
      }
      if (isMountedRef.current) setIsLoaded(true);

      // ✅ STEP 2: Try to sync from Firebase in background
      const user = auth.currentUser;
      if (user) {
        const firebaseProfile = await fetchProfile();
        if (!isMountedRef.current) return;
        if (firebaseProfile && firebaseProfile.firstName) {
          // Sync onboarding habits to AsyncStorage if present in Firestore profile
          if ((firebaseProfile as any).habits) {
            await AsyncStorage.setItem(
              `@onboarding_habits_${user.uid}`,
              JSON.stringify((firebaseProfile as any).habits)
            );
            log("✅ Onboarding habits synced from Firebase for user:", user.uid);
          }
          if (!isMountedRef.current) return;
          setProfile(firebaseProfile);
          // Update local cache
          await AsyncStorage.setItem("userProfile", JSON.stringify(firebaseProfile));
          log("✅ Profile synced from Firebase:", firebaseProfile.firstName);
        }
      }
      // If no currentUser, the auth state effect below will handle it when auth resolves
    } catch (e) {
      log("❌ reloadProfile error:", e);
      if (isMountedRef.current) setIsLoaded(true);
    }
  }, []);

  // Load on mount
  useEffect(() => { reloadProfile(); }, []);

  // ✅ Listen for auth state to sync profile when auth resolves (handles cold-start race)
  // This effect is separate so the listener is always cleaned up on unmount.
  useEffect(() => {
    let hasFiredForUid: string | null = null;
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u || u.uid === hasFiredForUid) return;
      hasFiredForUid = u.uid;
      // Only sync if we don't already have a profile loaded with real data
      try {
        const firebaseProfile = await fetchProfile();
        if (!isMountedRef.current) return;
        if (firebaseProfile && firebaseProfile.firstName) {
          if ((firebaseProfile as any).habits) {
            await AsyncStorage.setItem(
              `@onboarding_habits_${u.uid}`,
              JSON.stringify((firebaseProfile as any).habits)
            );
            log("✅ Onboarding habits synced from Firebase after auth for user:", u.uid);
          }
          if (!isMountedRef.current) return;
          setProfile(firebaseProfile);
          await AsyncStorage.setItem("userProfile", JSON.stringify(firebaseProfile));
          log("✅ Profile synced from Firebase after auth:", firebaseProfile.firstName);
        }
      } catch (e) {
        log("❌ auth state profile sync error:", e);
      }
    });
    return () => unsub();
  }, []);

  const saveProfileFn = useCallback(async (p: UserProfile) => {
    setProfile(p);
    await AsyncStorage.setItem("userProfile", JSON.stringify(p));
    await firebaseSave(p);
  }, []);

  const updateProfileFn = useCallback(async (partial: Partial<UserProfile>) => {
    // ✅ FIX: Use profileRef.current (always fresh) instead of `profile` from
    // closure. This prevents rapid sequential calls from clobbering each other
    // because `profile` in a closure captures a snapshot that may already be stale.
    const updated = { ...profileRef.current, ...partial };
    setProfile(updated);
    profileRef.current = updated;
    await AsyncStorage.setItem("userProfile", JSON.stringify(updated));
    await firebaseUpdate(partial);
  }, []); // no deps — reads from profileRef, not the stale `profile` closure

  const resetProfile = useCallback(async () => {
    setProfile(EMPTY_PROFILE);
    // Also clear the AsyncStorage cache so the empty profile persists
    // across app restarts (otherwise the old profile reloads from cache).
    try {
      await AsyncStorage.removeItem("userProfile");
    } catch (e) {
      log("⚠️ resetProfile: failed to clear AsyncStorage cache:", e);
    }
    log("🔄 Profile reset");
  }, []);

  const isProfileComplete = useCallback(() =>
    !!(profile.firstName && profile.email),
  [profile]);

  return (
    <ProfileContext.Provider value={{
      profile, isLoaded,
      weightKg: parseKg(profile.weight),
      heightCm: parseCm(profile.height),
      ageYears: parseAge(profile.dateOfBirth),
      isProfileComplete,
      saveProfile:   saveProfileFn,
      updateProfile: updateProfileFn,
      resetProfile,
      reloadProfile,
    }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() { return useContext(ProfileContext); }