// screens/BackupRestoreScreen.tsx
// ─── Google Drive Backup & Restore UI ────────────────────────────────────────

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
  const [phase, setPhase] = useState<Phase>("idle");
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastSizeKB, setLastSizeKB] = useState<number | null>(null);

  // ── Load last backup timestamp on mount ──────────────────────────────────
  useEffect(() => {
    getLastBackupTime().then(setLastBackupAt).catch(() => {});
  }, []);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  // ── BACKUP ────────────────────────────────────────────────────────────────

  const handleBackup = useCallback(async () => {
    setPhase("backing_up");
    setError(null);
    try {
      const { fileId, sizeKB } = await performBackup();
      const now = new Date().toISOString();
      setLastBackupAt(now);
      setLastSizeKB(sizeKB);
      setPhase("done_backup");
      console.log("☁️ Backup done:", fileId);
    } catch (err: any) {
      setError(err.message || "Backup failed. Please try again.");
      setPhase("idle");
    }
  }, []);

  // ── LIST backups from Drive ───────────────────────────────────────────────

  const handleListBackups = useCallback(async () => {
    setPhase("listing");
    setError(null);
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

  const handleRestore = useCallback(
    (fileId?: string, filename?: string) => {
      Alert.alert(
        "Restore Backup?",
        fileId
          ? `Restore from "${filename}"? This will replace ALL current data.`
          : "Restore the latest backup? This will replace ALL current data.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            style: "destructive",
            onPress: async () => {
              setPhase("restoring");
              setError(null);
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
    },
    []
  );

  // ── SIGN OUT ──────────────────────────────────────────────────────────────

  const handleSignOut = useCallback(async () => {
    await signOutGoogle();
    Alert.alert("Signed out", "Google Drive disconnected. Your local data is intact.");
  }, []);

  // ── Loading overlay ───────────────────────────────────────────────────────

  const isBusy = phase === "backing_up" || phase === "listing" || phase === "restoring";

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.headerIcon}>☁️</Text>
        <Text style={s.headerTitle}>Backup & Restore</Text>
        <Text style={s.headerSub}>
          Your health data is stored on-device.{"\n"}
          Back up to Google Drive to protect it.
        </Text>
      </View>

      {/* ── Last backup info ────────────────────────────────────────────── */}
      <View style={s.card}>
        <Text style={s.cardLabel}>LAST BACKUP</Text>
        <Text style={s.cardValue}>
          {lastBackupAt ? formatDate(lastBackupAt) : "Never backed up"}
        </Text>
        {lastSizeKB && (
          <Text style={s.cardSub}>Backup size: {lastSizeKB} KB</Text>
        )}
      </View>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>❌ {error}</Text>
        </View>
      )}

      {/* ── Success banners ─────────────────────────────────────────────── */}
      {phase === "done_backup" && (
        <View style={s.successBanner}>
          <Text style={s.successText}>✅ Backup uploaded to Google Drive!</Text>
        </View>
      )}
      {phase === "done_restore" && (
        <View style={s.successBanner}>
          <Text style={s.successText}>
            ✅ Data restored! Please restart the app for all changes to take effect.
          </Text>
        </View>
      )}

      {/* ── Loading indicator ───────────────────────────────────────────── */}
      {isBusy && (
        <View style={s.busyRow}>
          <ActivityIndicator color="#7C3AED" size="large" />
          <Text style={s.busyText}>
            {phase === "backing_up" && "Backing up to Google Drive..."}
            {phase === "listing" && "Fetching backup history..."}
            {phase === "restoring" && "Restoring your data..."}
          </Text>
        </View>
      )}

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      {!isBusy && (
        <>
          <TouchableOpacity style={s.btnPrimary} onPress={handleBackup} activeOpacity={0.85}>
            <Text style={s.btnPrimaryText}>⬆️  Back Up Now</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.btnSecondary}
            onPress={() => handleRestore()}
            activeOpacity={0.85}
          >
            <Text style={s.btnSecondaryText}>⬇️  Restore Latest Backup</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.btnOutline}
            onPress={handleListBackups}
            activeOpacity={0.85}
          >
            <Text style={s.btnOutlineText}>📋  Browse Backup History</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Backup list ─────────────────────────────────────────────────── */}
      {backupFiles.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Backup History</Text>
          {backupFiles.map((file) => (
            <View key={file.id} style={s.backupRow}>
              <View style={s.backupInfo}>
                <Text style={s.backupName} numberOfLines={1}>
                  {file.name}
                </Text>
                <Text style={s.backupDate}>{formatDate(file.createdTime)}</Text>
                {file.size && (
                  <Text style={s.backupSize}>{Math.round(Number(file.size) / 1024)} KB</Text>
                )}
              </View>
              <TouchableOpacity
                style={s.restoreSmallBtn}
                onPress={() => handleRestore(file.id, file.name)}
              >
                <Text style={s.restoreSmallText}>Restore</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* ── Sign-out ────────────────────────────────────────────────────── */}
      {!isBusy && (
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={s.signOutText}>Disconnect Google Drive</Text>
        </TouchableOpacity>
      )}

      {/* ── Info footer ─────────────────────────────────────────────────── */}
      <View style={s.footer}>
        <Text style={s.footerText}>
          🔒 Backups are private to this app — not visible in your Google Drive.
          {"\n"}Medicines, symptoms, hydration, and simulation history are all included.
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PURPLE = "#7C3AED";
const PURPLE_LIGHT = "#EDE9FE";
const BG = "#0F0F1A";
const CARD_BG = "#1A1A2E";
const TEXT = "#F0F0FF";
const TEXT_MUTED = "#888";
const SUCCESS_BG = "#052E16";
const SUCCESS_TEXT = "#4ADE80";
const ERROR_BG = "#2D0A0A";
const ERROR_TEXT = "#F87171";

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  content: { padding: 24, paddingBottom: 60 },

  header: { alignItems: "center", marginBottom: 28 },
  headerIcon: { fontSize: 48, marginBottom: 8 },
  headerTitle: {
    fontSize: 24, fontWeight: "700", color: TEXT, marginBottom: 6, letterSpacing: 0.3,
  },
  headerSub: { fontSize: 14, color: TEXT_MUTED, textAlign: "center", lineHeight: 20 },

  card: {
    backgroundColor: CARD_BG, borderRadius: 16, padding: 20,
    marginBottom: 20, borderWidth: 1, borderColor: "#2A2A4A",
  },
  cardLabel: { fontSize: 11, color: TEXT_MUTED, letterSpacing: 1.2, fontWeight: "600", marginBottom: 6 },
  cardValue: { fontSize: 18, color: TEXT, fontWeight: "600" },
  cardSub: { fontSize: 13, color: TEXT_MUTED, marginTop: 4 },

  errorBanner: {
    backgroundColor: ERROR_BG, borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: "#5C1010",
  },
  errorText: { color: ERROR_TEXT, fontSize: 14, fontWeight: "500" },

  successBanner: {
    backgroundColor: SUCCESS_BG, borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: "#14532D",
  },
  successText: { color: SUCCESS_TEXT, fontSize: 14, fontWeight: "500", lineHeight: 20 },

  busyRow: { alignItems: "center", paddingVertical: 32, gap: 16 },
  busyText: { color: TEXT_MUTED, fontSize: 15, marginTop: 12 },

  btnPrimary: {
    backgroundColor: PURPLE, borderRadius: 14, padding: 18,
    alignItems: "center", marginBottom: 12,
    shadowColor: PURPLE, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },

  btnSecondary: {
    backgroundColor: "#1E1E3A", borderRadius: 14, padding: 18,
    alignItems: "center", marginBottom: 12,
    borderWidth: 1, borderColor: PURPLE,
  },
  btnSecondaryText: { color: PURPLE, fontSize: 16, fontWeight: "600" },

  btnOutline: {
    backgroundColor: "transparent", borderRadius: 14, padding: 18,
    alignItems: "center", marginBottom: 20,
    borderWidth: 1, borderColor: "#3A3A5A",
  },
  btnOutlineText: { color: TEXT_MUTED, fontSize: 15, fontWeight: "500" },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13, color: TEXT_MUTED, letterSpacing: 1.1,
    fontWeight: "600", marginBottom: 12,
  },

  backupRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: CARD_BG, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: "#2A2A4A",
  },
  backupInfo: { flex: 1, marginRight: 12 },
  backupName: { color: TEXT, fontSize: 13, fontWeight: "500", marginBottom: 3 },
  backupDate: { color: TEXT_MUTED, fontSize: 12 },
  backupSize: { color: TEXT_MUTED, fontSize: 11, marginTop: 2 },

  restoreSmallBtn: {
    backgroundColor: PURPLE_LIGHT, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  restoreSmallText: { color: PURPLE, fontSize: 13, fontWeight: "600" },

  signOutBtn: { alignItems: "center", paddingVertical: 12, marginBottom: 16 },
  signOutText: { color: "#EF4444", fontSize: 14, fontWeight: "500" },

  footer: {
    backgroundColor: CARD_BG, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: "#2A2A4A",
  },
  footerText: { color: TEXT_MUTED, fontSize: 13, lineHeight: 20 },
});
