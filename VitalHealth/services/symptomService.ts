// services/symptomService.ts

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

import { log, error } from "../utils/logger";

// ✅ TYPE (VERY IMPORTANT)
export interface Symptom {
  id?: string;
  name: string;
  severity?: string;
  notes?: string;
  date?: string;
  createdAt?: any;
}

////////////////////////////////////////////////////////////

// ✅ ADD SYMPTOM
export const addSymptom = async (uid: string, symptom: Symptom) => {
  try {
    const ref = collection(db, "users", uid, "symptoms");

    const docRef = await addDoc(ref, {
      name: symptom.name || "",
      severity: symptom.severity || "Low",
      notes: symptom.notes || "",
      date: symptom.date || new Date().toISOString(),
      createdAt: new Date(),
    });

    return docRef.id;
  } catch (err: unknown) {
    error("❌ Error adding symptom:", err);
    throw error;
  }
};

////////////////////////////////////////////////////////////

// ✅ GET ALL SYMPTOMS (ONCE)
export const getSymptoms = async (uid: string): Promise<Symptom[]> => {
  try {
    const q = query(
      collection(db, "users", uid, "symptoms"),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Symptom),
    }));
  } catch (err: unknown) {
    error("❌ Error fetching symptoms:", err);
    return [];
  }
};

////////////////////////////////////////////////////////////

// ✅ REAL-TIME SUBSCRIBE
export const subscribeSymptoms = (
  uid: string,
  callback: (data: Symptom[]) => void
) => {
  const q = query(
    collection(db, "users", uid, "symptoms"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Symptom),
    }));

    callback(data);
  }, (error) => {
    log("⚠️ Symptom onSnapshot error:", error);
  });
};

////////////////////////////////////////////////////////////

// ✅ UPDATE SYMPTOM
export const updateSymptom = async (
  uid: string,
  symptomId: string,
  updates: Partial<Symptom>
) => {
  try {
    const ref = doc(db, "users", uid, "symptoms", symptomId);

    await updateDoc(ref, {
      ...updates,
      updatedAt: new Date(),
    });
  } catch (err: unknown) {
    error("❌ Error updating symptom:", err);
    throw error;
  }
};

////////////////////////////////////////////////////////////

// ✅ DELETE SYMPTOM
export const deleteSymptom = async (uid: string, symptomId: string) => {
  try {
    const ref = doc(db, "users", uid, "symptoms", symptomId);
    await deleteDoc(ref);
  } catch (err: unknown) {
    error("❌ Error deleting symptom:", err);
    throw error;
  }
};