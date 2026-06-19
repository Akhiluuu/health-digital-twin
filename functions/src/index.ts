import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

export const findUserByHealthId = functions.https.onCall(async (data, context) => {
  // 1. Enforce authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const queryText = data.healthId;
  if (!queryText) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a 'healthId' argument."
    );
  }

  const input = queryText.trim().toUpperCase();
  const db = admin.firestore();

  // 2. Perform indexed queries on server side
  try {
    let querySnapshot = await db
      .collection("users")
      .where("inviteCode", "==", input)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      querySnapshot = await db
        .collection("users")
        .where("healthId", "==", input)
        .limit(1)
        .get();
    }

    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      const userData = docSnap.data();
      return {
        uid: docSnap.id,
        firstName: userData.firstName || "",
        lastName: userData.lastName || "",
        inviteCode: userData.inviteCode || userData.healthId || "",
        bloodGroup: userData.bloodGroup || "",
        gender: userData.gender || "",
        profileImage: userData.profileImage || "",
        phone: userData.phone || "",
        dateOfBirth: userData.dateOfBirth || "",
        height: userData.height || "",
        weight: userData.weight || "",
        allergies: userData.allergies || [],
        medications: userData.medications || [],
        emergencyContact: userData.emergencyContact || {},
      };
    }

    return null;
  } catch (error: any) {
    throw new functions.https.HttpsError(
      "internal",
      `Error looking up user: ${error.message}`
    );
  }
});
