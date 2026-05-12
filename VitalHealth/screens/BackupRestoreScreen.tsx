// screens/BackupRestoreScreen.tsx
// ─── Google Drive Backup & Restore UI — themed to match app design system ─────

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import {
  getLastBackupTime,
  listDriveBackups,
  performBackup,
  performRestore,
  signOutGoogle,
} from "../database/backupService";

// ─── Types ────────────────────────────────────────────────────────────────────

type BackupFile = {
  id: string;
  name: string;
  createdTime: string;
  size: string;
};

type Phase = "idle" | "backing_up" | "listing" | "restoring" | "done_backup" | "done_restore";

// ─── Component ────────────────────────────────────────────────────────────────

export default function BackupRestoreScreen() {
  const { theme } = useTheme();
  const c = colors[theme];

  const [phase, setPhase] = useState<Phase>("idle");
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastSizeKB, setLastSizeKB] = useState<number | null>(null);

  useEffect(() => {
    getLastBackupTime().then(setLastBackupAt).catch(() => {});
  }, []);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  // ── BACKUP ────────────────────────────────────────────────────────────────

  const handleBackup = useCallback(async () => {
    setPhase("backing_up"); setError(null);
    try {
      const { fileId, sizeKB } = await performBackup();
      setLastBackupAt(new Date().toISOString());
      setLastSizeKB(sizeKB);
      setPhase("done_backup");
    } catch (err: any) {
      setError(err.message || "Backup failed. Please try again.");
      setPhase("idle");
    }
  }, []);

  // ── LIST ──────────────────────────────────────────────────────────────────

  const handleListBackups = useCallback(async () => {
    setPhase("listing"); setError(null);
    try {
      const files = await listDriveBackups();
      setBackupFiles(files);
      setPhase("idle");
    } catch (err: any) {
      setError(err.message || "Could not fetch backup list.");
      setPhase("idle");
    }
  }, []);

  // ── RESTORE ───────────────────────────────────────────────────────────────

  const handleRestore = useCallback((fileId?: string, filename?: string) => {
    Alert.alert(
      "Restore Backup?",
      fileId
        ? `Restore from "${filename}"? This will replace ALL current data.`
        : "Restore the latest backup? This will replace ALL current data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore", style: "destructive",
          onPress: async () => {
            setPhase("restoring"); setError(null);
            try {
              await performRestore(fileId);
              setPhase("done_restore");
            } catch (err: any) {
              setError(err.message || "Restore failed.");
              setPhase("idle");
            }
          },
        },
      ]
    );
  }, []);

  // ── SIGN OUT ──────────────────────────────────────────────────────────────

  const handleSignOut = useCallback(async () => {
    await signOutGoogle();
    Alert.alert("Signed out", "Google Drive disconnected. Your local data is intact.");
  }, []);

  const isBusy = phase === "backing_up" || phase === "listing" || phase === "restoring";

  return (
    <ScrollView
      style={[s.screen, { backgroundColor: c.bg }]}
      contentContainerStyle={s.content}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={[s.headerIconWrap, { backgroundColor: c.accent + "18", borderColor: c.accent + "40" }]}>
          <Text style={s.headerIconEmoji}>☁️</Text>
        </View>
        <Text style={[s.headerTitle, { color: c.text }]}>Backup & Restore</Text>
        <Text style={[s.headerSub, { color: c.sub }]}>
          Your health data is stored on-device.{"\n"}
          Back up to Google Drive to protect it.
        </Text>
      </View>

      {/* ── Last backup info ──────────────────────────────────────────── */}
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.cardRow}>
          <Ionicons name="time-outline" size={18} color={c.accent} />
          <Text style={[s.cardLabel, { color: c.sub }]}>LAST BACKUP</Text>
        </View>
        <Text style={[s.cardValue, { color: c.text }]}>
          {lastBackupAt ? formatDate(lastBackupAt) : "Never backed up"}
        </Text>
        {lastSizeKB && (
          <Text style={[s.cardSub, { color: c.sub }]}>Backup size: {lastSizeKB} KB</Text>
        )}
      </View>

      {/* ── Error banner ──────────────────────────────────────────────── */}
      {error && (
        <View style={[s.banner, s.bannerError, { borderColor: "#ef444440" }]}>
          <Ionicons name="close-circle" size={18} color="#ef4444" />
          <Text style={[s.bannerText, { color: "#ef4444" }]}>{error}</Text>
        </View>
      )}

      {/* ── Success banners ───────────────────────────────────────────── */}
      {phase === "done_backup" && (
        <View style={[s.banner, s.bannerSuccess, { borderColor: "#10b98140" }]}>
          <Ionicons name="checkmark-circle" size={18} color="#10b981" />
          <Text style={[s.bannerText, { color: "#10b981" }]}>Backup uploaded to Google Drive!</Text>
        </View>
      )}
      {phase === "done_restore" && (
        <View style={[s.banner, s.bannerSuccess, { borderColor: "#10b98140" }]}>
          <Ionicons name="checkmark-circle" size={18} color="#10b981" />
          <Text style={[s.bannerText, { color: "#10b981" }]}>
            Data restored! Restart the app for all changes to take effect.
          </Text>
        </View>
      )}

      {/* ── Loading indicator ─────────────────────────────────────────── */}
      {isBusy && (
        <View style={[s.busyCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <ActivityIndicator color={c.accent} size="large" />
          <Text style={[s.busyText, { color: c.sub }]}>
            {phase === "backing_up" && "Backing up to Google Drive…"}
            {phase === "listing" && "Fetching backup history…"}
            {phase === "restoring" && "Restoring your data…"}
          </Text>
        </View>
      )}

      {/* ── Action buttons ────────────────────────────────────────────── */}
      {!isBusy && (
        <>
          <TouchableOpacity
            style={[s.btnPrimary, { backgroundColor: c.accent }]}
            onPress={handleBackup}
            activeOpacity={0.85}
          >
            <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
            <Text style={s.btnPrimaryText}>Back Up Now</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btnSecondary, { backgroundColor: c.card, borderColor: c.accent + "60" }]}
            onPress={() => handleRestore()}
            activeOpacity={0.85}
          >
            <Ionicons name="cloud-download-outline" size={20} color={c.accent} />
            <Text style={[s.btnSecondaryText, { color: c.accent }]}>Restore Latest Backup</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btnOutline, { borderColor: c.border }]}
            onPress={handleListBackups}
            activeOpacity={0.85}
          >
            <Ionicons name="list-outline" size={20} color={c.sub} />
            <Text style={[s.btnOutlineText, { color: c.sub }]}>Browse Backup History</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Backup list ───────────────────────────────────────────────── */}
      {backupFiles.length > 0 && (
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: c.sub }]}>BACKUP HISTORY</Text>
          {backupFiles.map((file) => (
            <View key={file.id} style={[s.backupRow, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={[s.backupIconWrap, { backgroundColor: c.accent + "15" }]}>
                <Ionicons name="cloud-outline" size={20} color={c.accent} />
              </View>
              <View style={s.backupInfo}>
                <Text style={[s.backupName, { color: c.text }]} numberOfLines={1}>{file.name}</Text>
                <Text style={[s.backupDate, { color: c.sub }]}>{formatDate(file.createdTime)}</Text>
                {file.size && (
                  <Text style={[s.backupSize, { color: c.sub }]}>
                    {Math.round(Number(file.size) / 1024)} KB
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[s.restoreBtn, { backgroundColor: c.accent + "18", borderColor: c.accent + "40" }]}
                onPress={() => handleRestore(file.id, file.name)}
              >
                <Text style={[s.restoreBtnText, { color: c.accent }]}>Restore</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* ── Sign-out ──────────────────────────────────────────────────── */}
      {!isBusy && (
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={16} color={c.danger} />
          <Text style={[s.signOutText, { color: c.danger }]}>Disconnect Google Drive</Text>
        </TouchableOpacity>
      )}

      {/* ── Info footer ───────────────────────────────────────────────── */}
      <View style={[s.footer, { backgroundColor: c.card, borderColor: c.border }]}>
        <Ionicons name="lock-closed-outline" size={16} color={c.sub} style={{ marginBottom: 6 }} />
        <Text style={[s.footerText, { color: c.sub }]}>
          Backups are private to this app — not visible in your Google Drive.
          {"\n"}Medicines, symptoms, hydration, and simulation history are all included.
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 24, paddingBottom: 60 },

  // Header
  header: { alignItems: "center", marginBottom: 28, paddingTop: 8 },
  headerIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  headerIconEmoji: { fontSize: 34 },
  headerTitle: { fontSize: 24, fontWeight: "800", marginBottom: 8, letterSpacing: 0.3 },
  headerSub: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  // Info card
  card: { borderRadius: 16, padding: 18, marginBottom: 20, borderWidth: 1 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  cardLabel: { fontSize: 11, letterSpacing: 1.2, fontWeight: "700" },
  cardValue: { fontSize: 17, fontWeight: "600" },
  cardSub: { fontSize: 13, marginTop: 4 },

  // Banners
  banner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1,
  },
  bannerError: { backgroundColor: "#ef444412" },
  bannerSuccess: { backgroundColor: "#10b98112" },
  bannerText: { flex: 1, fontSize: 14, fontWeight: "500", lineHeight: 20 },

  // Busy
  busyCard: {
    borderRadius: 16, padding: 32, alignItems: "center",
    gap: 14, marginBottom: 16, borderWidth: 1,
  },
  busyText: { fontSize: 15, textAlign: "center" },

  // Buttons
  btnPrimary: {
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, marginBottom: 12,
    shadowColor: "#38bdf8", shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },

  btnSecondary: {
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, marginBottom: 12, borderWidth: 1.5,
  },
  btnSecondaryText: { fontSize: 16, fontWeight: "600" },

  btnOutline: {
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, marginBottom: 20, borderWidth: 1,
  },
  btnOutlineText: { fontSize: 15, fontWeight: "500" },

  // Section
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, letterSpacing: 1.2, fontWeight: "700", marginBottom: 12 },

  // Backup rows
  backupRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1,
  },
  backupIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  backupInfo: { flex: 1 },
  backupName: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  backupDate: { fontSize: 12, marginBottom: 1 },
  backupSize: { fontSize: 11 },

  restoreBtn: {
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1,
  },
  restoreBtnText: { fontSize: 13, fontWeight: "600" },

  // Sign out
  signOutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, marginBottom: 16,
  },
  signOutText: { fontSize: 14, fontWeight: "500" },

  // Footer
  footer: { borderRadius: 12, padding: 16, borderWidth: 1, alignItems: "center" },
  footerText: { fontSize: 13, lineHeight: 20, textAlign: "center" },
});
