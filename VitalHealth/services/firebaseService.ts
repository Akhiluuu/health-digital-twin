// services/firebaseService.ts

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";

export async function findUserByHealthId(healthId: string) {
  try {
    if (!healthId) {
      console.log("❌ No healthId provided");
      return null;
    }

    // ✅ Normalize input
    const input = healthId.trim().toUpperCase();

    console.log("🔍 Searching for Health ID:", input);

    ////////////////////////////////////////////////////////
    // 🔥 PRIMARY QUERY (FAST & CORRECT)
    ////////////////////////////////////////////////////////

    const q = query(
      collection(db, "users"),
      where("inviteCode", "==", input)
    );

    let snapshot = await getDocs(q);

    ////////////////////////////////////////////////////////
    // 🔁 FALLBACK: SEARCH BY HEALTH ID (INDEXED)
    ////////////////////////////////////////////////////////
    if (snapshot.empty) {
      console.log("⚠️ Primary inviteCode search failed, trying healthId query...");
      const q2 = query(
        collection(db, "users"),
        where("healthId", "==", input)
      );
      snapshot = await getDocs(q2);
    }

    ////////////////////////////////////////////////////////
    // ✅ IF FOUND
    ////////////////////////////////////////////////////////
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      const data = docSnap.data();

      console.log("✅ User found:", docSnap.id);

      return {
        uid: docSnap.id,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        inviteCode: data.inviteCode || data.healthId || "",
        bloodGroup: data.bloodGroup || "",
        gender: data.gender || "",
        profileImage: data.profileImage || "",
        phone: data.phone || "",
        dateOfBirth: data.dateOfBirth || "",
        height: data.height || "",
        weight: data.weight || "",
        allergies: data.allergies || [],
        medications: data.medications || [],
        emergencyContact: data.emergencyContact || {},
      };
    }

    console.log("❌ No user found for:", input);
    return null;

  } catch (error) {
    console.log("❌ Search error:", error);
    return null;
  }
}