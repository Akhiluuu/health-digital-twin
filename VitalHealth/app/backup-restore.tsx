// app/backup-restore.tsx
// Expo Router page — wraps the BackupRestoreScreen component

import { Stack } from "expo-router";
import BackupRestoreScreen from "../screens/BackupRestoreScreen";

export default function BackupRestorePage() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "Backup & Restore",
          headerStyle: { backgroundColor: "#0F0F1A" },
          headerTintColor: "#F0F0FF",
          headerTitleStyle: { fontWeight: "700" },
          headerBackTitle: "Settings",
        }}
      />
      <BackupRestoreScreen />
    </>
  );
}
