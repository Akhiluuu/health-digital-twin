import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { isLoggedIn } from "../services/authStorage";
import { getProfile, saveProfile } from "../services/profileStorage";
import { auth } from "../services/firebase";
import { fetchProfile } from "../services/profileService";

export default function Startup() {
  const router = useRouter();

  useEffect(() => {
    const checkApp = async () => {
      // 1. Wait a moment for Firebase Auth to initialize and restore session
      const user = await new Promise<any>((resolve) => {
        const unsubscribe = auth.onAuthStateChanged((u) => {
          unsubscribe();
          resolve(u);
        });
        setTimeout(() => resolve(auth.currentUser), 1500);
      });

      // 2. If not logged in, go to welcome screen
      const localLoggedIn = await isLoggedIn();
      if (!user && !localLoggedIn) {
        router.replace("/welcome");
        return;
      }

      // 3. Check if we have a local cached profile
      let profile = await getProfile();

      // 4. If not found locally but logged in, try to restore from Firestore
      if (!profile && user) {
        try {
          const remoteProfile = await fetchProfile(user.uid);
          if (remoteProfile && remoteProfile.firstName) {
            profile = remoteProfile;
            await saveProfile(remoteProfile);
          }
        } catch (e) {
          console.log("⚠️ Failed to restore remote profile during startup:", e);
        }
      }

      // 5. Route based on profile completion status
      if (!profile || !profile.firstName) {
        router.replace("/onboarding/personal");
      } else {
        router.replace("/(tabs)");
      }
    };

    checkApp();
  }, []);

  return (
    <View style={{
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#ffffff"
    }}>
      <ActivityIndicator size="large" color="#0ea5e9" />
    </View>
  );
}