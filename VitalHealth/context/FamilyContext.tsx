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
import { log, warn, error } from "../utils/logger";

import {
  fetchLinkedMembers,
  fetchMemberHealthData,
  linkFamilyMember,
  unlinkFamilyMember,
} from "../services/familySync";

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
  switchToMember:   (memberUid: string, force?: boolean)  => Promise<void>;
  switchToSelf:     ()                   => Promise<void>;
  updateActiveProfile: (newProfile: UserProfile) => Promise<void>;
  reportLoading?: (key: string, loading: boolean) => void;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [isLoaded, activeMemberId]);

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
        // 1. Fetch bidirectional linked members
        const linked = await fetchLinkedMembers();
        const linkedMembersList: FamilyMember[] = [];
        for (const link of linked) {
          const health = await fetchMemberHealthData(link.uid);
          linkedMembersList.push({
            id: link.uid,
            uid: link.uid,
            userId: link.uid,
            firstName: link.firstName,
            lastName: link.lastName || "",
            name: `${link.firstName} ${link.lastName || ""}`.trim(),
            relation: link.relation,
            relationship: link.relation,
            inviteCode: link.inviteCode,
            status: link.status,
            ...health,
          } as FamilyMember);
        }

        // 2. Fetch local/dependent members from familyMembers array
        const userSnap = await getDoc(doc(db, "users", uid));
        let dependents: FamilyMember[] = [];
        if (userSnap.exists()) {
          dependents = userSnap.data()?.familyMembers || [];
        }

        // Combine both, deduplicating by uid/id so a member that appears in
        // both the linked-members list AND the local familyMembers array is
        // only included once (avoids the duplicate-key React warning).
        const seen = new Set<string>();
        const combined = [...linkedMembersList, ...dependents].filter((m) => {
          const key = normalizeId(m.id) || normalizeId(m.uid) || normalizeId(m.userId);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setMembers(combined);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
        (async () => {
          try {
            const { syncAndScheduleAllFamilyMedicines } = require("../services/medicineSync");
            await syncAndScheduleAllFamilyMedicines(combined);
          } catch (err) {
            log("⚠️ Background family medicine sync failed:", err);
          }
        })();

        // ── Self-heal: remove any entries from the familyMembers Firestore array
        // that are already covered by linkedMembers. This ensures future loads
        // don't re-introduce duplicates from the old local array.
        const linkedUids = new Set(linkedMembersList.map(m => normalizeId(m.id) || normalizeId(m.uid) || normalizeId(m.userId)).filter(Boolean) as string[]);
        const cleanedDependents = dependents.filter(d => {
          const dKey = normalizeId(d.id) || normalizeId(d.uid) || normalizeId(d.userId);
          return !dKey || !linkedUids.has(dKey);
        });
        if (cleanedDependents.length !== dependents.length) {
          // Some dependents were already in linkedMembers — update Firestore to clean up
          await setDoc(doc(db, "users", uid), { familyMembers: cleanedDependents }, { merge: true });
          log(`[FamilyContext] Cleaned up ${dependents.length - cleanedDependents.length} duplicate(s) from familyMembers array`);
        }

        return;
      }

      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        let parsed: any = null;
        try { parsed = JSON.parse(stored); } catch { log('[FamilyContext] Corrupted member cache, clearing'); await AsyncStorage.removeItem(STORAGE_KEY); }
        if (Array.isArray(parsed)) {
          setMembers(parsed);
          (async () => {
            try {
              const { syncAndScheduleAllFamilyMedicines } = require("../services/medicineSync");
              await syncAndScheduleAllFamilyMedicines(parsed);
            } catch (err) {
              log("⚠️ Background cached family medicine sync failed:", err);
            }
          })();
        } else { await AsyncStorage.removeItem(STORAGE_KEY); setMembers([]); }
      }
    } catch (e) {
      error("❌ FamilyContext loadMembers error:", e);
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
      error("❌ FamilyContext saveMembers error:", e);
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
      error("❌ FamilyContext addMember error:", e);
    }
  };

  const removeMember = async (id: string) => {
    try {
      const nid = normalizeId(id);

      // 1. Unlink if linked member
      await unlinkFamilyMember(id);

      // 2. Remove from dependent members array if present
      const uid = await getUserId();
      if (uid) {
        const userSnap = await getDoc(doc(db, "users", uid));
        if (userSnap.exists()) {
          const fm: FamilyMember[] = userSnap.data()?.familyMembers || [];
          const updatedDependents = fm.filter(
            (m) =>
              normalizeId(m.id)     !== nid &&
              normalizeId(m.uid)    !== nid &&
              normalizeId(m.userId) !== nid
          );
          await setDoc(doc(db, "users", uid), { familyMembers: updatedDependents }, { merge: true });
        }
      }

      await loadMembers();
      // ✅ FIX: normalize activeMemberId before comparing so uid formats don't diverge
      if (normalizeId(activeMemberId) === nid) await switchToSelf();
    } catch (e) {
      error("❌ FamilyContext removeMember error:", e);
    }
  };

  const getMemberById = (id: string): FamilyMember | undefined =>
    _findMemberInList(members, id);

  const refreshMembers = async () => { await loadMembers(); };

  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const isSwitchingRef = useRef(false);
  const lastSwitchTimeRef = useRef<number>(0);

  const reportLoading = useCallback((key: string, loading: boolean) => {
    setLoadingStates((prev) => {
      if (prev[key] === loading) return prev;
      return { ...prev, [key]: loading };
    });
  }, []);

  useEffect(() => {
    if (!isSwitchLoading) return;

    // Check if any reported context is currently loading
    const anyLoading = Object.values(loadingStates).some((loading) => loading === true);

    if (!anyLoading) {
      const elapsed = Date.now() - lastSwitchTimeRef.current;
      const remaining = Math.max(0, 300 - elapsed); // 300ms min animation time
      const timer = setTimeout(() => {
        setIsSwitchLoading(false);
        isSwitchingRef.current = false;
      }, remaining);
      return () => clearTimeout(timer);
    }
  }, [loadingStates, isSwitchLoading]);

  /* ── SWITCH BACK TO SELF ─────────────────────────────────────────
     Defined BEFORE switchToMember so switchToMember can list it
     in its useCallback dependency array without forward-ref issues.
  */
  const switchToSelf = useCallback(async () => {
    log("🔄 Switching back to self");
    lastSwitchTimeRef.current = Date.now();
    setLoadingStates({
      medicine: true,
      symptoms: true,
      hydration: true,
    });
    setIsSwitchLoading(true);
    try {
      setActiveMemberId("self");
      setActiveProfile(selfProfileRef.current);
      await AsyncStorage.setItem(ACTIVE_MEMBER_KEY, "self");
    } catch (e) {
      error("❌ switchToSelf error:", e);
      setIsSwitchLoading(false);
    }
  }, []);

  /* ── SWITCH TO MEMBER ─────────────────────────────────────────
     Calls fetchProfile(uid) — same function ProfileContext uses —
     reads doc("users", uid) with full EMPTY_PROFILE safe merge.
     This guarantees the switched profile has the exact same shape
     as the logged-in user's profile everywhere in the app.
  */
  const switchToMember = useCallback(async (memberUid: string, force: boolean = false) => {
    if (!memberUid || memberUid === "self") return;

    // ✅ Guard: reject concurrent calls synchronously
    if (isSwitchingRef.current) {
      log("[FamilyContext] switchToMember: already switching, ignoring duplicate call for:", memberUid);
      return;
    }

    if (activeMemberId === memberUid) {
      if (!force) {
        // Tapping active member again → switch back to self
        await switchToSelf();
      }
      return;
    }

    isSwitchingRef.current = true;
    lastSwitchTimeRef.current = Date.now();
    setLoadingStates({
      medicine: true,
      symptoms: true,
      hydration: true,
    });
    setIsSwitchLoading(true);
    try {
      log("🔄 Switching profile to UID:", memberUid);

      const memberProfile = await fetchProfile(memberUid);

      if (memberProfile && memberProfile.firstName) {
        log("✅ Profile loaded:", memberProfile.firstName, memberProfile.lastName);
        setActiveProfile(memberProfile);
      } else {
        // No profile doc in Firestore → use family member metadata as fallback
        const member = _findMemberInList(members, memberUid);
        warn("⚠️ No full profile for:", memberUid, "— using metadata fallback");
        setActiveProfile({
          ...EMPTY_PROFILE,
          firstName: member?.firstName ?? "Unknown",
          lastName:  member?.lastName  ?? "",
        });
      }

      setActiveMemberId(memberUid);
      await AsyncStorage.setItem(ACTIVE_MEMBER_KEY, memberUid);
    } catch (e) {
      error("❌ switchToMember error:", e);
      setIsSwitchLoading(false);
      isSwitchingRef.current = false;
    }
  }, [activeMemberId, members, switchToSelf]);


  /* ── UPDATE ACTIVE PROFILE ────────────────────────────────── */
  const updateActiveProfile = useCallback(async (newProfile: UserProfile) => {
    setActiveProfile(newProfile);
    setMembers((prev) =>
      prev.map((m) => {
        if (m.uid === activeMemberId || m.id === activeMemberId || m.userId === activeMemberId) {
          return {
            ...m,
            firstName: newProfile.firstName,
            lastName: newProfile.lastName || "",
            name: `${newProfile.firstName} ${newProfile.lastName || ""}`.trim(),
          };
        }
        return m;
      })
    );
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
          let parsed: FamilyMember[] = [];
          try {
            const p = JSON.parse(stored);
            if (Array.isArray(p)) parsed = p;
          } catch { log('[FamilyContext] updateActiveProfile: corrupted member cache'); }
          if (parsed.length > 0) {
            const updatedList = parsed.map((m) => {
              if (m.uid === activeMemberId || m.id === activeMemberId || m.userId === activeMemberId) {
                return {
                  ...m,
                  firstName: newProfile.firstName,
                  lastName: newProfile.lastName || "",
                  name: `${newProfile.firstName} ${newProfile.lastName || ""}`.trim(),
                };
              }
              return m;
            });
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
          }
        }
    } catch (err) {
      error("❌ updateActiveProfile storage error:", err);
    }
  }, [activeMemberId]);

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
      activeMemberInfo, switchToMember, switchToSelf, updateActiveProfile,
      reportLoading,
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