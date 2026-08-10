import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { getProfile, saveProfile } from "../services/profileStorage";
import { auth } from "../services/firebase";
import { fetchProfile } from "../services/profileService";

export default function Startup() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    const checkApp = async () => {
      // 1. Wait for Firebase Auth to initialize and restore session.
      const user = await new Promise<any>((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            unsubscribe();
            resolve(auth.currentUser);
          }
        }, 1800);

        const unsubscribe = auth.onAuthStateChanged((u) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            unsubscribe();
            resolve(u);
          }
        });
      });

      if (!isMounted) return;

      // 2. If not logged in, go straight to welcome ("Get Started") screen
      if (!user) {
        router.replace("/welcome");
        return;
      }

      // 3. Check for local cached profile
      let profile = await getProfile();

      // 4. If not found locally but user is logged in, attempt restore from Firestore
      if ((!profile || (!profile.firstName && !profile.name)) && user) {
        try {
          const remoteProfile = await fetchProfile(user.uid);
          if (remoteProfile && (remoteProfile.firstName || remoteProfile.name)) {
            profile = remoteProfile;
            await saveProfile(remoteProfile);
          }
        } catch (e) {
          console.log("⚠️ Failed to restore remote profile during startup:", e);
        }
      }

      if (!isMounted) return;

      // 5. Route based on profile completion status
      const hasCompletedProfile = profile && (profile.firstName || profile.name);
      if (hasCompletedProfile) {
        router.replace("/(tabs)");
      } else {
        router.replace("/onboarding/personal");
      }
    };

    checkApp();
    return () => { isMounted = false; };
  }, []);

  return (
    <View style={{
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#040a14"
    }}>
      <ActivityIndicator size="large" color="#3b82f6" />
    </View>
  );
}