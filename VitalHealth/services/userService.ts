import { db } from "./firebase";
import { doc, setDoc, collection, getDocs, writeBatch } from "firebase/firestore";

import { log } from "../utils/logger";

export const createUserProfile = async (uid: string, data: any) => {
  await setDoc(doc(db, "users", uid), {
    profile: data,
  });
};

/**
 * Completely purges all user-owned data from Firestore:
 * - The root user document (users/{uid})
 * - Nested health metrics documents (users/{uid}/health/hydration)
 * - All documents in subcollections (medicines, symptoms, etc.)
 */
export const deleteUserFirestoreData = async (uid: string) => {
  const batch = writeBatch(db);

  // 1. Delete main user document
  const userRef = doc(db, "users", uid);
  batch.delete(userRef);

  // 2. Delete hydration document
  const hydrationRef = doc(db, "users", uid, "health", "hydration");
  batch.delete(hydrationRef);

  await batch.commit();

  // 3. Helper to delete documents in subcollections
  const deleteSubcollection = async (subName: string) => {
    const colRef = collection(db, "users", uid, subName);
    const snap = await getDocs(colRef);
    const subBatch = writeBatch(db);
    snap.docs.forEach((docSnap) => {
      subBatch.delete(docSnap.ref);
    });
    if (!snap.empty) {
      await subBatch.commit();
    }
  };

  // Delete all known subcollections
  const subcollections = [
    "medicines",
    "medicineHistory",
    "symptoms",
    "symptomHistory",
    "heartRate"
  ];

  for (const sub of subcollections) {
    try {
      await deleteSubcollection(sub);
    } catch (e) {
      log(`⚠️ Failed to delete subcollection ${sub}:`, e);
    }
  }
};