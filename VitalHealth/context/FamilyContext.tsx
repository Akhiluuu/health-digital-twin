// context/FamilyContext.tsx
// Global profile switching — activeMemberId + activeProfile persisted across the app.
// Uses fetchProfile(uid) from profileService — same function ProfileContext uses —
// so the Firestore read is identical: doc("users", uid) with full safe EMPTY_PROFILE merge.

import React, {
  createContext, useContext, useEffect,
  useState, useCallback, useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { getUserId } from "../services/firebaseSync";
import { FamilyMember } from "../types/FamilyMember";
import {
  UserProfile,
  EMPTY_PROFILE,
  fetchProfile,     // ← reuse exact same safe fetch as ProfileContext
} from "../services/profileService";

/* ──────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────── */
export type FamilyContextType = {
  members:          FamilyMember[];
  isLoaded:         boolean;
  addMember:        (member: FamilyMember) => Promise<void>;
  removeMember:     (id: string)           => Promise<void>;
  getMemberById:    (id: string)           => FamilyMember | undefined;
  refreshMembers:   ()                     => Promise<void>;

  // ── Profile switching ──────────────────────────────────────
  activeMemberId:   string;               // "self" or a member UID
  activeProfile:    UserProfile;          // the profile shown app-wide right now
  isSwitched:       boolean;             // true when viewing another member
  isSwitchLoading:  boolean;             // true while fetching switched profile from Firebase
  activeMemberInfo: FamilyMember | null; // FamilyMember metadata for the active non-self member
  switchToMember:   (memberUid: string)  => Promise<void>;
  switchToSelf:     ()                   => Promise<void>;
};

const FamilyContext = createContext<FamilyContextType | null>(null);

const STORAGE_KEY       = "vitalhealth_family_members";
const ACTIVE_MEMBER_KEY = "vitalhealth_active_member_id";

/* ──────────────────────────────────────────────────────────────
   Utility
   ────────────────────────────────────────────────────────────── */
const normalizeId = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  return String(value);
};

/* ──────────────────────────────────────────────────────────────
   Provider
   selfProfile — the logged-in user's own profile, passed in from
   ProfileContext via FamilyProviderWithProfile in _layout.tsx
   ────────────────────────────────────────────────────────────── */
export const FamilyProvider = ({
  children,
  selfProfile,
}: {
  children:    React.ReactNode;
  selfProfile: UserProfile;
}) => {
  const [members,         setMembers]         = useState<FamilyMember[]>([]);
  const [isLoaded,        setIsLoaded]        = useState(false);
  const [activeMemberId,  setActiveMemberId]  = useState<string>("self");
  const [activeProfile,   setActiveProfile]   = useState<UserProfile>(selfProfile);
  const [isSwitchLoading, setIsSwitchLoading] = useState(false);

  // Always keep a ref to the latest selfProfile so async callbacks see current value
  const selfProfileRef = useRef<UserProfile>(selfProfile);
  useEffect(() => {
    selfProfileRef.current = selfProfile;
    // When our own profile updates and we're on "self", stay in sync
    if (activeMemberId === "self") {
      setActiveProfile(selfProfile);
    }
  }, [selfProfile, activeMemberId]);

  // ── Mount: load members + restore last session ─────────────
  useEffect(() => {
    loadMembers();
    restoreSession();
  }, []);

  /* After members finish loading, if we were switched, re-fetch
     the member's profile from Firebase so it's fresh on app open. */
  useEffect(() => {
    if (!isLoaded) return;
    if (activeMemberId === "self") {
      setActiveProfile(selfProfileRef.current);
      return;
    }
    fetchProfile(activeMemberId)
      .then((p) => {
        if (p) {
          setActiveProfile(p);
        } else {
          const member = _findMemberInList(members, activeMemberId);
          if (member) {
            setActiveProfile({
              ...EMPTY_PROFILE,
              firstName: member.firstName ?? "",
              lastName:  member.lastName  ?? "",
            });
          } else {
            // Member no longer exists → fall back to self
            setActiveMemberId("self");
            setActiveProfile(selfProfileRef.current);
            AsyncStorage.setItem(ACTIVE_MEMBER_KEY, "self").catch(() => {});
          }
        }
      })
      .catch(() => {
        setActiveMemberId("self");
        setActiveProfile(selfProfileRef.current);
        AsyncStorage.setItem(ACTIVE_MEMBER_KEY, "self").catch(() => {});
      });
  }, [isLoaded]); // intentionally runs once after members load

  /* ── Restore saved active session ─────────────────────────── */
  const restoreSession = async () => {
    try {
      const saved = await AsyncStorage.getItem(ACTIVE_MEMBER_KEY);
      if (saved && saved !== "self") {
        setActiveMemberId(saved);
        // Profile will be fetched in the isLoaded effect above
      }
    } catch (_) {}
  };

  /* ── Load members ────────────────────────────────────────── */
  const loadMembers = async () => {
    try {
      setIsLoaded(false);
      const uid = await getUserId();
      if (uid) {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
          const fm = snap.data()?.familyMembers || [];
          if (Array.isArray(fm)) {
            setMembers(fm);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fm));
            return;
          }
        }
      }
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setMembers(parsed);
        else { await AsyncStorage.removeItem(STORAGE_KEY); setMembers([]); }
      }
    } catch (e) {
      console.error("❌ FamilyContext loadMembers error:", e);
      setMembers([]);
    } finally {
      setIsLoaded(true);
    }
  };

  /* ── Save members ─────────────────────────────────────────── */
  const saveMembers = async (data: FamilyMember[]) => {
    try {
      setMembers(data);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      const uid = await getUserId();
      if (uid) await setDoc(doc(db, "users", uid), { familyMembers: data }, { merge: true });
    } catch (e) {
      console.error("❌ FamilyContext saveMembers error:", e);
    }
  };

  /* ── Internal find helper ─────────────────────────────────── */
  const _findMemberInList = (list: FamilyMember[], id: string): FamilyMember | undefined => {
    const nid = normalizeId(id);
    return list.find(
      (m) =>
        normalizeId(m.id)     === nid ||
        normalizeId(m.uid)    === nid ||
        normalizeId(m.userId) === nid
    );
  };

  /* ── Public CRUD ──────────────────────────────────────────── */
  const addMember = async (member: FamilyMember) => {
    try {
      const nid =
        normalizeId(member.id) ||
        normalizeId(member.uid) ||
        normalizeId(member.userId) ||
        Date.now().toString();

      const newMember: FamilyMember = {
        ...member,
        id:       nid,
        uid:      normalizeId(member.uid)    || nid,
        userId:   normalizeId(member.userId) || nid,
        relation: member.relation || member.relationship || "Family",
      };

      const exists = members.some(
        (m) =>
          normalizeId(m.id)     === nid ||
          normalizeId(m.uid)    === nid ||
          normalizeId(m.userId) === nid
      );
      if (exists) return;
      await saveMembers([...members, newMember]);
    } catch (e) {
      console.error("❌ FamilyContext addMember error:", e);
    }
  };

  const removeMember = async (id: string) => {
    try {
      const nid = normalizeId(id);
      const updated = members.filter(
        (m) =>
          normalizeId(m.id)     !== nid &&
          normalizeId(m.uid)    !== nid &&
          normalizeId(m.userId) !== nid
      );
      await saveMembers(updated);
      if (activeMemberId === nid) await switchToSelf();
    } catch (e) {
      console.error("❌ FamilyContext removeMember error:", e);
    }
  };

  const getMemberById = (id: string): FamilyMember | undefined =>
    _findMemberInList(members, id);

  const refreshMembers = async () => { await loadMembers(); };

  /* ── SWITCH TO MEMBER ─────────────────────────────────────────
     Calls fetchProfile(uid) — same function ProfileContext uses —
     reads doc("users", uid) with full EMPTY_PROFILE safe merge.
     This guarantees the switched profile has the exact same shape
     as the logged-in user's profile everywhere in the app.
  */
  const switchToMember = useCallback(async (memberUid: string) => {
    if (!memberUid || memberUid === "self") return;
    if (activeMemberId === memberUid) {
      // Tapping active member again → switch back to self
      await switchToSelf();
      return;
    }

    setIsSwitchLoading(true);
    try {
      console.log("🔄 Switching profile to UID:", memberUid);

      const memberProfile = await fetchProfile(memberUid);

      if (memberProfile && memberProfile.firstName) {
        console.log("✅ Profile loaded:", memberProfile.firstName, memberProfile.lastName);
        setActiveProfile(memberProfile);
      } else {
        // No profile doc in Firestore → use family member metadata as fallback
        const member = _findMemberInList(members, memberUid);
        console.warn("⚠️ No full profile for:", memberUid, "— using metadata fallback");
        setActiveProfile({
          ...EMPTY_PROFILE,
          firstName: member?.firstName ?? "Unknown",
          lastName:  member?.lastName  ?? "",
        });
      }

      setActiveMemberId(memberUid);
      await AsyncStorage.setItem(ACTIVE_MEMBER_KEY, memberUid);
    } catch (e) {
      console.error("❌ switchToMember error:", e);
    } finally {
      setIsSwitchLoading(false);
    }
  }, [activeMemberId, members]);

  /* ── SWITCH BACK TO SELF ─────────────────────────────────── */
  const switchToSelf = useCallback(async () => {
    console.log("🔄 Switching back to self");
    setActiveMemberId("self");
    setActiveProfile(selfProfileRef.current);
    await AsyncStorage.setItem(ACTIVE_MEMBER_KEY, "self");
  }, []);

  // ── Derived ────────────────────────────────────────────────
  const isSwitched       = activeMemberId !== "self";
  const activeMemberInfo = isSwitched
    ? (_findMemberInList(members, activeMemberId) ?? null)
    : null;

  return (
    <FamilyContext.Provider value={{
      members, isLoaded,
      addMember, removeMember, getMemberById, refreshMembers,
      activeMemberId, activeProfile, isSwitched, isSwitchLoading,
      activeMemberInfo, switchToMember, switchToSelf,
    }}>
      {children}
    </FamilyContext.Provider>
  );
};

/* ──────────────────────────────────────────────────────────────
   Hook
   ────────────────────────────────────────────────────────────── */
export const useFamily = () => {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error("useFamily must be used within a FamilyProvider");
  return ctx;
};