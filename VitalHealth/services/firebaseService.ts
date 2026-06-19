import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export async function findUserByHealthId(healthId: string) {
  try {
    if (!healthId) {
      console.log("❌ No healthId provided");
      return null;
    }

    // ✅ Normalize input
    const input = healthId.trim().toUpperCase();

    console.log("🔍 Calling Cloud Function to find user:", input);

    const searchFunc = httpsCallable(functions, "findUserByHealthId");
    const result = await searchFunc({ healthId: input });
    return result.data as any;

  } catch (error) {
    console.log("❌ Cloud Function Search error:", error);
    return null;
  }
}