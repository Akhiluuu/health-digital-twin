//_layout.tsx

///////////////////////////////////////////////////////////
// ⚠️ FIRST IMPORTS — KEEP THIS ORDER
///////////////////////////////////////////////////////////
import "../services/foregroundStepService";
import "../tasks/stepTrackingTask";

///////////////////////////////////////////////////////////

import { Stack } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

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
import { FamilyProvider } from "../context/FamilyContext";

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
  const profile = useProfile();
  const weightKg = profile?.weightKg ?? 70;
  const heightCm = profile?.heightCm ?? 170;
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
  // FOREGROUND NOTIFICATION HANDLER
  ///////////////////////////////////////////////////////////
  useEffect(() => {
    const unsubscribe = registerNotifeeForegroundHandler();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

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
    <ThemeProvider defaultTheme="light">
      <ProfileProvider>
        <FamilyProviderWithProfile>
          <StepProviderWrapper>
            <HydrationProvider>
              <BiogearsTwinProvider>
                <NutritionProvider>
                  <Stack screenOptions={{ headerShown: false }}>
                    {/* Authentication & Startup */}
                    <Stack.Screen name="startup" />
                    <Stack.Screen name="welcome" />
                    <Stack.Screen name="signin" />
                    <Stack.Screen name="signup" />

                    {/* Onboarding */}
                    <Stack.Screen name="onboarding/personal" />
                    <Stack.Screen name="onboarding/medical" />
                    <Stack.Screen name="onboarding/habits" />
                    <Stack.Screen name="onboarding/history" />
                    <Stack.Screen name="onboarding/review" />

                    {/* Main App Tabs */}
                    <Stack.Screen name="(tabs)" />

                    {/* Family Health Screens */}
                    <Stack.Screen name="family/index" />
                    <Stack.Screen name="family/member-details" />

                    {/* Additional Screens */}
                    <Stack.Screen name="MedicationVault" />
                    <Stack.Screen name="member-health" />
                    <Stack.Screen name="symptom-log" />
                    <Stack.Screen name="symptom-flow" />
                    <Stack.Screen name="symptom-followup" />
                    <Stack.Screen name="symptom-chat" />
                    <Stack.Screen name="backup-restore" />
                    <Stack.Screen name="settings-server" />
                    <Stack.Screen name="settings-ai" />
                  </Stack>
                </NutritionProvider>
              </BiogearsTwinProvider>
            </HydrationProvider>
          </StepProviderWrapper>
        </FamilyProviderWithProfile>
      </ProfileProvider>
    </ThemeProvider>
  );
}