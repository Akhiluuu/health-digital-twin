// app/backup-restore.tsx
// Expo Router page — wraps the BackupRestoreScreen component

import { Stack } from "expo-router";
import BackupRestoreScreen from "../screens/BackupRestoreScreen";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import { useStackBackHandler } from "../hooks/useStackBackHandler";

export default function BackupRestorePage() {
  useStackBackHandler();
  const { theme } = useTheme();
  const c = colors[theme];

  return (
    <>
      <Stack.Screen
        options={{
          title: "Backup & Restore",
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: "700" },
          headerShadowVisible: false,
          headerBackTitle: "Settings",
        }}
      />
      <BackupRestoreScreen />
    </>
  );
}
