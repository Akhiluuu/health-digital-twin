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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import SimProgressOverlay from "../components/twin/SimProgressOverlay";
import { useBiogearsTwin } from "../context/BiogearsTwinContext";

///////////////////////////////////////////////////////////
// DATABASE INITIALIZATION
///////////////////////////////////////////////////////////
import { initAllTables } from "../database/schema";
import { initHistoryTable } from "../database/historySchema";
import { initMedicineDB, markMissedMedicines } from "../database/medicineDB";
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
// GLOBAL SIMULATION BANNER — persists across all tabs/screens
///////////////////////////////////////////////////////////
function GlobalSimBanner() {
  const { simulationStatus, simulationProgress, simulationError } = useBiogearsTwin();
  const insets = useSafeAreaInsets();
  return (
    <SimProgressOverlay
      status={simulationStatus as any}
      progress={simulationProgress}
      error={simulationError}
      bottomOffset={60 + insets.bottom}
    />
  );
}

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

        /////////////////////////////////////////////////////
        // 🔔 SETUP NOTIFICATIONS
        /////////////////////////////////////////////////////
        await setupNotifee();
        console.log("🔔 Notifications initialized");

        await new Promise((res) => setTimeout(res, 500));

        // 🗄️ INITIALIZE DATABASES
        /////////////////////////////////////////////////////
        // One call creates ALL tables in vital_health.db atomically.
        // Individual initXxxDB() are now no-ops kept for compatibility.
        await initAllTables();
        await initHistoryTable();    // safe fallback — no-op if already exists
        await initMedicineDB();      // logs confirmation
        await initSymptomDB();       // logs confirmation
        await initHydrationDB();     // logs confirmation
        await initHydrationHistoryDB();

        /////////////////////////////////////////////////////
        // 🔄 POST-INITIALIZATION TASKS
        /////////////////////////////////////////////////////
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
  // ✅ Registered here only — NOT in index.js
  // index.js only handles the background handler (onBackgroundEvent)
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
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#ffffff",
        }}
      >
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  ///////////////////////////////////////////////////////////
  // MAIN NAVIGATION WITH CONTEXT PROVIDERS
  ///////////////////////////////////////////////////////////
  return (
    <ThemeProvider defaultTheme="light">
      <ProfileProvider>
        <FamilyProvider>
          <StepProviderWrapper>
            <HydrationProvider>
              <MedicineProvider>
                <BiogearsTwinProvider>
                  <SymptomsProvider>
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
                      </Stack>
                      {/* Global BioGears banner — visible on every screen */}
                      <GlobalSimBanner />
                    </NutritionProvider>
                  </SymptomsProvider>
                </BiogearsTwinProvider>
              </MedicineProvider>
            </HydrationProvider>
          </StepProviderWrapper>
        </FamilyProvider>
      </ProfileProvider>
    </ThemeProvider>
  );
}