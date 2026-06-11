//_layout.tsx

///////////////////////////////////////////////////////////
// ⚠️ FIRST IMPORTS — KEEP THIS ORDER
///////////////////////////////////////////////////////////
import "../services/foregroundStepService";
import "../tasks/stepTrackingTask";

///////////////////////////////////////////////////////////

import { Stack, router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import notifee from "@notifee/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

///////////////////////////////////////////////////////////
// CONTEXT PROVIDERS
///////////////////////////////////////////////////////////
import { BiogearsTwinProvider } from "../context/BiogearsTwinContext";
import { HydrationProvider } from "../context/HydrationContext";
import { MedicineProvider } from "../context/MedicineContext";
import { NutritionProvider } from "../context/NutritionContext";
import { ProfileProvider, useProfile } from "../context/ProfileContext";
import { StepProvider } from "../context/StepContext";
import { SymptomsProvider } from "../context/SymptomContext";
import { ThemeProvider } from "../context/ThemeContext";
import { FamilyProvider, useFamily } from "../context/FamilyContext";

///////////////////////////////////////////////////////////
// DATABASE INITIALIZATION
///////////////////////////////////////////////////////////
import { initAllTables } from "../database/schema";
import { initHistoryTable } from "../database/historySchema";
import { initMedicineDB, markMissedMedicines, resetDailyTakenIfNewDay } from "../database/medicineDB";
import { initSymptomDB } from "../database/symptomDB";
import { initHydrationDB } from "../database/hydrationDB";
import { initHydrationHistoryDB } from "../database/hydrationHistoryDB";

///////////////////////////////////////////////////////////
// SERVICES
///////////////////////////////////////////////////////////
import { syncMedicinesFromFirebase } from "../services/medicineSync";
import {
  registerNotifeeForegroundHandler,
  setupNotifee,
} from "../services/notifeeService";

///////////////////////////////////////////////////////////
// UTILITIES
///////////////////////////////////////////////////////////
import { log, error } from "../utils/logger";

///////////////////////////////////////////////////////////
// PREVENT AUTO HIDE OF SPLASH SCREEN
///////////////////////////////////////////////////////////
SplashScreen.preventAutoHideAsync().catch(() => {});

///////////////////////////////////////////////////////////
// BRIDGE: Reads selfProfile from ProfileContext and passes
// it into FamilyProvider so profile switching works.
// MUST be rendered INSIDE <ProfileProvider>.
//
// ⚠️ IMPORTANT: MedicineProvider and SymptomsProvider are
// placed INSIDE this bridge so they can call useFamily()
// to detect when the active member changes and reload data
// from that member's Firebase doc automatically.
///////////////////////////////////////////////////////////
const FamilyProviderWithProfile: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { profile } = useProfile();
  return (
    <FamilyProvider selfProfile={profile}>
      {/* MedicineProvider and SymptomsProvider MUST be here,
          inside FamilyProvider, so useFamily() works inside them */}
      <MedicineProvider>
        <SymptomsProvider>
          {children}
        </SymptomsProvider>
      </MedicineProvider>
    </FamilyProvider>
  );
};

///////////////////////////////////////////////////////////
// STEP PROVIDER WRAPPER
///////////////////////////////////////////////////////////
const StepProviderWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { activeProfile } = useFamily();
  const weightKg = activeProfile?.weight ? parseFloat(String(activeProfile.weight).replace(/[^0-9.]/g, '')) : 70;
  const heightCm = activeProfile?.height ? parseFloat(String(activeProfile.height).replace(/[^0-9.]/g, '')) : 170;
  return (
    <StepProvider weightKg={weightKg} heightCm={heightCm}>
      {children}
    </StepProvider>
  );
};

///////////////////////////////////////////////////////////
// ROOT LAYOUT
///////////////////////////////////////////////////////////
export default function RootLayout() {
  const initialized = useRef(false);
  const [isReady, setIsReady] = useState(false);

  ///////////////////////////////////////////////////////////
  // APP INITIALIZATION
  ///////////////////////////////////////////////////////////
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const setupApp = async () => {
      try {
        log("🚀 Initializing VitalTwin App...");

        await setupNotifee();
        console.log("🔔 Notifications initialized");

        await new Promise((res) => setTimeout(res, 500));

        await initAllTables();
        await initHistoryTable();
        await initMedicineDB();
        resetDailyTakenIfNewDay();
        await initSymptomDB();
        await initHydrationDB();
        await initHydrationHistoryDB();

        await markMissedMedicines();
        await syncMedicinesFromFirebase();

        log("🔥 VitalTwin App Fully Initialized");
      } catch (err: any) {
        error("❌ Startup error:", err as Error);
      } finally {
        setIsReady(true);
        await SplashScreen.hideAsync().catch(() => {});
      }
    };

    setupApp();
  }, []);

  ///////////////////////////////////////////////////////////
  // FOREGROUND & COLD START NOTIFICATION HANDLER
  ///////////////////////////////////////////////////////////
  useEffect(() => {
    const unsubscribe = registerNotifeeForegroundHandler();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;

    // Handle cold start launches from notifications
    notifee.getInitialNotification().then((initialNotification) => {
      if (initialNotification) {
        const { notification } = initialNotification;
        const data = notification?.data ?? {};
        console.log("🔔 Cold start from notification:", data);
        
        // Short delay to ensure the React Navigation / Expo Router is fully mounted
        setTimeout(() => {
          if (data.type === "routine_reminder" && data.tab) {
            router.push({
              pathname: "/(tabs)/history",
              params: { tab: data.tab }
            } as any);
          } else if (data.type === "twin_reminder") {
            router.push("/(tabs)/twin" as any);
          } else if (data.type === "medicine") {
            router.push("/MedicationVault" as any);
          } else if (data.type === "hydration") {
            router.push({
              pathname: "/(tabs)/history",
              params: { tab: "hydration" }
            } as any);
          } else if (data.type === "symptom") {
            router.push({
              pathname: "/(tabs)/history",
              params: { tab: "symptoms" }
            } as any);
          }
        }, 1000);
      }
    }).catch((err) => {
      console.log("⚠️ Error checking initial notification:", err);
    });
  }, [isReady]);

  ///////////////////////////////////////////////////////////
  // LOADING SCREEN
  ///////////////////////////////////////////////////////////
  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#ffffff" }}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  ///////////////////////////////////////////////////////////
  // MAIN NAVIGATION WITH CONTEXT PROVIDERS
  //
  // Provider tree (order matters):
  //
  //  ThemeProvider
  //  └─ ProfileProvider                 ← own profile from Firebase
  //     └─ FamilyProviderWithProfile    ← bridge: passes selfProfile in
  //        └─ FamilyProvider            ← global activeMemberId + activeProfile
  //           └─ MedicineProvider       ← reacts to activeMemberId changes ✅
  //           └─ SymptomsProvider       ← reacts to activeMemberId changes ✅
  //              └─ StepProviderWrapper
  //              └─ HydrationProvider
  //              └─ BiogearsTwinProvider
  //              └─ NutritionProvider
  //
  // MedicineProvider + SymptomsProvider MUST be inside FamilyProvider
  // so they can call useFamily() and reload when switching profiles.
  ///////////////////////////////////////////////////////////
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider defaultTheme="light">
        <ProfileProvider>
          <FamilyProviderWithProfile>
            <StepProviderWrapper>
              <HydrationProvider>
                <BiogearsTwinProvider>
                  <NutritionProvider>
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        animation: 'slide_from_right',
                        gestureEnabled: true,
                        gestureDirection: 'horizontal',
                        fullScreenGestureEnabled: true,
                      }}
                    >
                      {/* Authentication & Startup */}
                      <Stack.Screen name="startup" options={{ animation: 'fade', gestureEnabled: false }} />
                      <Stack.Screen name="welcome" options={{ animation: 'fade', gestureEnabled: false }} />
                      <Stack.Screen name="signin"  options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical', gestureEnabled: true }} />
                      <Stack.Screen name="signup"  options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical', gestureEnabled: true }} />

                      {/* Onboarding — linear forward flow, no back swipe */}
                      <Stack.Screen name="onboarding/personal" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
                      <Stack.Screen name="onboarding/medical"  options={{ animation: 'slide_from_right', gestureEnabled: false }} />
                      <Stack.Screen name="onboarding/habits"   options={{ animation: 'slide_from_right', gestureEnabled: false }} />
                      <Stack.Screen name="onboarding/history"  options={{ animation: 'slide_from_right', gestureEnabled: false }} />
                      <Stack.Screen name="onboarding/review"   options={{ animation: 'slide_from_right', gestureEnabled: false }} />

                      {/* Main App Tabs — instant switch, no swipe-back to auth */}
                      <Stack.Screen name="(tabs)" options={{ animation: 'none', gestureEnabled: false }} />

                      {/* Family Health */}
                      <Stack.Screen name="family/index"          options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="family/member-details" options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="family/add-member"     options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />

                      {/* Health Sub-screens */}
                      <Stack.Screen name="MedicationVault"      options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="MedicineHistory"      options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="AddMedicine"          options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="member-health"        options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="backup-restore"       options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="activity"             options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="hydration"            options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="nutrition"            options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="rest"                 options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="profile"              options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="spo2"                 options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="sos"                  options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical', gestureEnabled: true }} />
                      <Stack.Screen name="step-intelligence"    options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="calorie-intelligence" options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="heart-scanner"        options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />

                      {/* Settings */}
                      <Stack.Screen name="settings"                  options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="settings-server"           options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="settings-ai"               options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="settings-about"            options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="settings-contacts"         options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="settings-data"             options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="settings-help"             options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="settings-language"         options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="settings-notifications"    options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="settings-security"         options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />

                      {/* Session Detail */}
                      <Stack.Screen name="session/[sessionId]" options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="session/[id]"        options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />

                      {/* Symptom flow */}
                      <Stack.Screen name="symptom-log"      options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical', gestureEnabled: true }} />
                      <Stack.Screen name="symptom-flow"     options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="symptom-followup" options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="symptom-chat"     options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                      <Stack.Screen name="symptom-history"  options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
                    </Stack>
                  </NutritionProvider>
                </BiogearsTwinProvider>
              </HydrationProvider>
            </StepProviderWrapper>
          </FamilyProviderWithProfile>
        </ProfileProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}