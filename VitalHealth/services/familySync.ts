import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "./firebase";
import { getUserId } from "./firebaseSync";
import { UserProfile } from "./profileService";
import { FamilyMember } from "../types/FamilyMember";

import { log, error } from "../utils/logger";

/* ──────────────────────────────────────────────────────────────
   Linked Member Type
   ────────────────────────────────────────────────────────────── */
export type LinkedMember = {
  uid: string;
  id?: string;
  userId?: string;
  firstName: string;
  lastName?: string;
  relation: string;
  profileImage?: string;
  inviteCode: string;
  status: "active" | "pending";
  bloodGroup?: string;
  gender?: string;
  dateOfBirth?: string;
  dob?: string;
};

/* 🔹 Get Current User UID */
const getMyUid = async (): Promise<string | null> => {
  return await getUserId();
};

/* ──────────────────────────────────────────────────────────────
   Fetch Linked Members
   ────────────────────────────────────────────────────────────── */
export async function fetchLinkedMembers(): Promise<LinkedMember[]> {
  try {
    const myUid = await getMyUid();
    if (!myUid) return [];

    const snap = await getDoc(doc(db, "users", myUid));
    if (!snap.exists()) return [];

    const data = snap.data();
    const raw = data?.linkedMembers || {};

    return Object.entries(raw).map(([key, value]: [string, any]) => ({
      uid: value.uid || key,
      id: value.uid || key,
      userId: value.uid || key,
      firstName: value.firstName || "",
      lastName: value.lastName || "",
      relation: value.relation || "Family",
      profileImage: value.profileImage || "",
      inviteCode: value.inviteCode || "",
      status: value.status || "active",
      bloodGroup: value.bloodGroup || "",
      gender: value.gender || "",
      dateOfBirth: value.dateOfBirth || value.dob || "",
      dob: value.dob || value.dateOfBirth || "",
    }));
  } catch (e) {
    log("❌ fetchLinkedMembers error:", e);
    return [];
  }
}

/* ──────────────────────────────────────────────────────────────
   Helper: Normalize Medicine Data
   ────────────────────────────────────────────────────────────── */
const normalizeMedicines = (meds: any[]): any[] =>
  meds.map((med) => ({
    name: med.name || "Unknown",
    dosage: med.dosage || med.dose || "",
    frequency: med.frequency || "",
    time: med.time || "",
    type: med.type || "",
    meal: med.meal || "",
    startDate: med.startDate || "",
    endDate: med.endDate || "",
    takenToday: med.takenToday ?? false,
  }));

/* ──────────────────────────────────────────────────────────────
   Helper: Fetch Latest Heart Rate
   ────────────────────────────────────────────────────────────── */
const fetchLatestHeartRate = async (uid: string): Promise<number> => {
  try {
    const hrQuery = query(
      collection(db, "users", uid, "heartRate"),
      orderBy("timestamp", "desc"),
      limit(1)
    );

    const hrSnap = await getDocs(hrQuery);

    if (!hrSnap.empty) {
      const hrData = hrSnap.docs[0].data();
      return hrData?.bpm || 0;
    }
  } catch (err: unknown) {
    log("⚠️ Unable to fetch heart rate:", err);
  }

  return 0;
};

/* ──────────────────────────────────────────────────────────────
   Fetch Member Health Data
   ────────────────────────────────────────────────────────────── */
export async function fetchMemberHealthData(
  uid: string
): Promise<Partial<FamilyMember> | null> {
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return null;

    const data = snap.data() || {};
    const health = data.healthData || data || {};

    /* 🔹 Fetch medicines */
    let medicines: any[] = [];
    try {
      const medsSnap = await getDocs(
        collection(db, "users", uid, "medicines")
      );
      medicines = medsSnap.docs.map((doc) => doc.data());
    } catch {
      medicines = health.medicines || [];
    }

    /* 🔹 Fetch symptoms */
    let symptoms: any[] = [];
    try {
      const symSnap = await getDocs(
        collection(db, "users", uid, "symptoms")
      );
      symptoms = symSnap.docs.map((doc) => doc.data());
    } catch {
      symptoms = health.symptoms || [];
    }

    /* 🔹 Fetch latest heart rate */
    const heartRate = await fetchLatestHeartRate(uid);

    return {
      id: uid,
      uid,
      userId: uid,
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      phone: data.phone || "",
      dateOfBirth: data.dateOfBirth || data.dob,
      dob: data.dob || data.dateOfBirth,
      gender: data.gender || health?.gender,
      bloodGroup: data.bloodGroup || health?.bloodGroup,
      height: data.height || health?.height,
      weight: data.weight || health?.weight,
      isDependent: !!data.isDependent,
      managedBy: data.managedBy || "",
      heartRate,
      spo2: health?.spo2,
      hydration: health?.hydration,
      steps: health?.steps,
      calories: health?.calories || 0,
      medicines: normalizeMedicines(medicines),
      symptoms: Array.isArray(symptoms) ? symptoms : [],
      profileImage: data.profileImage,
      updatedAt: data.updatedAt,
    };
  } catch (err: unknown) {
    error("❌ Error fetching member health data:", err);
    return null;
  }
}

/* ──────────────────────────────────────────────────────────────
   Real-Time Listener
   ────────────────────────────────────────────────────────────── */
export function subscribeToMemberHealth(
  uid: string,
  callback: (data: Partial<FamilyMember> | null) => void
) {
  try {
    const userRef = doc(db, "users", uid);

    // Debounce guard: prevents cascading sub-collection reads when the user
    // doc updates rapidly (e.g. a profile save or step sync while the listener
    // is active). Without this, every write triggers a full medicines + symptoms
    // + heartRate read burst.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const doSubcollectionRead = async (data: any) => {
      const health = data.healthData || data || {};

      let medicines: any[] = [];
      let symptoms: any[] = [];

      try {
        const medsSnap = await getDocs(
          collection(db, "users", uid, "medicines")
        );
        medicines = medsSnap.docs.map((doc) => doc.data());
      } catch {
        medicines = health.medicines || [];
      }

      try {
        const symSnap = await getDocs(
          collection(db, "users", uid, "symptoms")
        );
        symptoms = symSnap.docs.map((doc) => doc.data());
      } catch {
        symptoms = health.symptoms || [];
      }

      const heartRate = await fetchLatestHeartRate(uid);

      callback({
        id: uid,
        uid,
        userId: uid,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        dateOfBirth: data.dateOfBirth || data.dob,
        dob: data.dob || data.dateOfBirth,
        gender: health?.gender,
        bloodGroup: health?.bloodGroup,
        height: health?.height,
        weight: health?.weight,
        heartRate,
        spo2: health?.spo2,
        hydration: health?.hydration,
        steps: health?.steps,
        calories: health?.calories || 0,
        medicines: normalizeMedicines(medicines),
        symptoms: Array.isArray(symptoms) ? symptoms : [],
        profileImage: data.profileImage,
        updatedAt: data.updatedAt,
      });
    };

    // ─── Listener for user document ─────────────────────────────────────────
    const unsubscribeUser = onSnapshot(
      userRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null);
          return;
        }
        const data = snapshot.data() || {};

        // Debounce: collapse rapid document updates into a single read burst
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          doSubcollectionRead(data).catch((err: any) => {
            if (err?.code !== "permission-denied") {
              log("⚠️ subscribeToMemberHealth read error:", err?.code);
            }
          });
        }, 500); // 500ms window collapses rapid consecutive writes
      },
      (err: any) => {
        // Silently ignore permission-denied — Firestore rules only allow
        // reading your own doc; the one-shot fetch already filled the UI.
        if (err?.code !== "permission-denied") {
          log("⚠️ subscribeToMemberHealth error:", err?.code);
        }
      }
    );

    // ─── Listener for heart rate subcollection ───────────────────────────────
    const hrRef = collection(db, "users", uid, "heartRate");
    const unsubscribeHR = onSnapshot(
      query(hrRef, orderBy("timestamp", "desc"), limit(1)),
      (snapshot) => {
        if (!snapshot.empty) {
          const hrData = snapshot.docs[0].data();
          callback({
            heartRate: hrData?.bpm || 0,
          });
        }
      },
      (err: any) => {
        if (err?.code !== "permission-denied") {
          log("⚠️ subscribeToMemberHealth HR error:", err?.code);
        }
      }
    );

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribeUser();
      unsubscribeHR();
    };
  } catch (err: unknown) {
    error("❌ Subscription error:", err);
    return () => {};
  }
}

/* ──────────────────────────────────────────────────────────────
   Find User by Health ID
   ────────────────────────────────────────────────────────────── */
export async function findUserByHealthId(
  healthId: string
): Promise<(UserProfile & { uid: string }) | null> {
  try {
    const input = healthId.trim().toUpperCase();

    const q = query(
      collection(db, "users"),
      where("inviteCode", "==", input)
    );

    const snap = await getDocs(q);
    if (snap.empty) return null;

    const docSnap = snap.docs[0];
    return { ...(docSnap.data() as UserProfile), uid: docSnap.id };
  } catch (e) {
    log("❌ findUserByHealthId error:", e);
    return null;
  }
}

/* ──────────────────────────────────────────────────────────────
   Link Family Member
   ────────────────────────────────────────────────────────────── */
export async function linkFamilyMember(
  targetUid: string,
  targetProfile: { firstName: string; lastName: string },
  targetHealthId: string,
  relation: string,
  myProfile: { firstName: string; lastName: string },
  myInviteCode: string
): Promise<boolean> {
  try {
    const myUid = await getMyUid();
    if (!myUid || myUid === targetUid) return false;

    const linkToMe: LinkedMember = {
      uid: myUid,
      id: myUid,
      userId: myUid,
      firstName: myProfile.firstName,
      lastName: myProfile.lastName,
      relation,
      inviteCode: myInviteCode,
      status: "active",
    };

    const linkToTarget: LinkedMember = {
      uid: targetUid,
      id: targetUid,
      userId: targetUid,
      firstName: targetProfile.firstName,
      lastName: targetProfile.lastName,
      relation,
      inviteCode: targetHealthId,
      status: "active",
    };

    // ✅ Use dot-notation keys so updateDoc only touches the single entry,
    //    leaving all other existing linkedMembers untouched.
    await updateDoc(doc(db, "users", targetUid), {
      [`linkedMembers.${myUid}`]: linkToMe,
    }).catch(async () => {
      // If the doc doesn't exist yet, fall back to setDoc with merge
      await setDoc(doc(db, "users", targetUid), { linkedMembers: { [myUid]: linkToMe } }, { merge: true });
    });

    await updateDoc(doc(db, "users", myUid), {
      [`linkedMembers.${targetUid}`]: linkToTarget,
    }).catch(async () => {
      await setDoc(doc(db, "users", myUid), { linkedMembers: { [targetUid]: linkToTarget } }, { merge: true });
    });

    return true;
  } catch (e) {
    log("❌ linkFamilyMember error:", e);
    return false;
  }
}

/* ──────────────────────────────────────────────────────────────
   Create Dependent Profile — no own account/email/phone needed
   ────────────────────────────────────────────────────────────── */
export async function createDependentProfile(details: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  height: string;
  weight: string;
  relation: string;
}): Promise<{ newId: string; inviteCode: string } | null> {
  try {
    const myUid = await getMyUid();
    if (!myUid) return null;

    // Not a Firebase Auth UID — just a unique document ID for this person.
    const newId = `dep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Generate a truly unique Health ID / inviteCode.
    // Mix UID + timestamp + random to eliminate collisions even if
    // two dependents are created in the same millisecond.
    const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const timePart = Date.now().toString(36).toUpperCase().slice(-4);
    const uidPart = myUid.replace(/[^a-zA-Z0-9]/g, "").substring(0, 4).toUpperCase();
    const depCode = `VT-${uidPart}${timePart}-${randomSuffix.substring(0, 4)}`;

    const dependentProfile = {
      firstName: details.firstName,
      lastName: details.lastName,
      email: "",
      // Dependent profiles have no phone number — store empty string, never fabricate one.
      phone: "",
      dateOfBirth: details.dateOfBirth,
      dob: details.dateOfBirth,
      gender: details.gender,
      bloodGroup: details.bloodGroup,
      height: details.height,
      weight: details.weight,
      inviteCode: depCode,
      healthId: depCode,
      linkedMembers: {},
      biogears_registered: false,
      isDependent: true,
      managedBy: myUid,
      createdAt: new Date().toISOString(),
    };

    await setDoc(doc(db, "users", newId), dependentProfile);

    const linkEntry: LinkedMember = {
      uid: newId,
      id: newId,
      userId: newId,
      firstName: details.firstName,
      lastName: details.lastName,
      relation: details.relation,
      inviteCode: depCode,
      status: "active",
      bloodGroup: details.bloodGroup,
      gender: details.gender,
      dateOfBirth: details.dateOfBirth,
      dob: details.dateOfBirth,
    };

    await updateDoc(doc(db, "users", myUid), {
      [`linkedMembers.${newId}`]: linkEntry,
    }).catch(async () => {
      await setDoc(doc(db, "users", myUid), { linkedMembers: { [newId]: linkEntry } }, { merge: true });
    });

    return { newId, inviteCode: depCode };
  } catch (e) {
    log("❌ createDependentProfile error:", e);
    return null;
  }
}

/* ──────────────────────────────────────────────────────────────
   Unlink Family Member
   ────────────────────────────────────────────────────────────── */
export async function unlinkFamilyMember(
  targetUid: string
): Promise<void> {
  try {
    const myUid = await getMyUid();
    if (!myUid) return;

    // ── Check if target is a dependent managed by me ──────────────────────────
    // If it is, delete the document entirely to prevent orphaned database records.
    if (targetUid.startsWith("dep_")) {
      const depRef = doc(db, "users", targetUid);
      const depSnap = await getDoc(depRef);
      if (depSnap.exists()) {
        const depData = depSnap.data();
        if (depData?.managedBy === myUid) {
          const { deleteDoc } = await import("firebase/firestore");
          await deleteDoc(depRef);
          log(`🧹 Deleted orphaned dependent profile document: ${targetUid}`);
        }
      }
    }

    // ✅ Dot-notation deleteField only removes the single entry
    await updateDoc(doc(db, "users", myUid), {
      [`linkedMembers.${targetUid}`]: deleteField(),
    }).catch(() => {});

    await updateDoc(doc(db, "users", targetUid), {
      [`linkedMembers.${myUid}`]: deleteField(),
    }).catch(() => {});
  } catch (e) {
    log("❌ unlinkFamilyMember error:", e);
  }
}

/* ──────────────────────────────────────────────────────────────
   Update Dependent Profile
   ────────────────────────────────────────────────────────────── */
export async function updateDependentProfile(
  dependentUid: string,
  details: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    bloodGroup: string;
    height: string;
    weight: string;
    relation: string;
  }
): Promise<boolean> {
  try {
    const myUid = await getMyUid();
    if (!myUid) return false;

    // 1. Get existing inviteCode/healthId
    const depRef = doc(db, "users", dependentUid);
    const depSnap = await getDoc(depRef);
    const inviteCode = depSnap.exists()
      ? (depSnap.data()?.inviteCode || depSnap.data()?.healthId || "")
      : "";

    // 2. Update the dependent's own document in users
    await updateDoc(depRef, {
      firstName: details.firstName,
      lastName: details.lastName,
      dateOfBirth: details.dateOfBirth,
      dob: details.dateOfBirth,
      gender: details.gender,
      bloodGroup: details.bloodGroup,
      height: details.height,
      weight: details.weight,
      inviteCode: inviteCode,
      healthId: inviteCode,
      updatedAt: new Date().toISOString(),
    });

    // 3. Update the parent's linkedMembers map entry
    const parentRef = doc(db, "users", myUid);
    const linkEntry = {
      uid: dependentUid,
      id: dependentUid,
      userId: dependentUid,
      firstName: details.firstName,
      lastName: details.lastName,
      relation: details.relation,
      inviteCode: inviteCode,
      status: "active",
      bloodGroup: details.bloodGroup,
      gender: details.gender,
      dateOfBirth: details.dateOfBirth,
      dob: details.dateOfBirth,
    };

    await updateDoc(parentRef, {
      [`linkedMembers.${dependentUid}`]: linkEntry,
    });

    return true;
  } catch (e) {
    error("❌ updateDependentProfile error:", e);
    return false;
  }
}