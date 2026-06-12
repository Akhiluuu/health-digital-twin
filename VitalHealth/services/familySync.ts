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
    console.log("❌ fetchLinkedMembers error:", e);
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
  } catch (error) {
    console.log("⚠️ Unable to fetch heart rate:", error);
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
    };
  } catch (error) {
    console.error("❌ Error fetching member health data:", error);
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

    // ─── Listener for user document ─────────────────────────────────────────
    // onError: silently swallow permission-denied — the one-shot
    // fetchMemberHealthData() already populated the UI with initial data.
    const unsubscribeUser = onSnapshot(
      userRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          callback(null);
          return;
        }

        const data = snapshot.data() || {};
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
      },
      (err: any) => {
        // Silently ignore permission-denied — Firestore rules only allow
        // reading your own doc; the one-shot fetch already filled the UI.
        if (err?.code !== "permission-denied") {
          console.log("⚠️ subscribeToMemberHealth error:", err?.code);
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
          console.log("⚠️ subscribeToMemberHealth HR error:", err?.code);
        }
      }
    );

    return () => {
      unsubscribeUser();
      unsubscribeHR();
    };
  } catch (error) {
    console.error("❌ Subscription error:", error);
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
    console.log("❌ findUserByHealthId error:", e);
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
    console.log("❌ linkFamilyMember error:", e);
    return false;
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

    // ✅ Dot-notation deleteField only removes the single entry
    await updateDoc(doc(db, "users", myUid), {
      [`linkedMembers.${targetUid}`]: deleteField(),
    }).catch(() => {});

    await updateDoc(doc(db, "users", targetUid), {
      [`linkedMembers.${myUid}`]: deleteField(),
    }).catch(() => {});
  } catch (e) {
    console.log("❌ unlinkFamilyMember error:", e);
  }
}