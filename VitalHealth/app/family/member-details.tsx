// app/family/member-details.tsx
// Production member details screen with:
// – Live Firestore subscription for real-time health updates
// – Theme support
// – Profile-switch CTA
// – Proper "Switch Profile" button to view everything in their context

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useFamily } from "../../context/FamilyContext";
import { useTheme } from "../../context/ThemeContext";
import { colors as globalColors } from "../../theme/colors";
import {
  fetchMemberHealthData,
  subscribeToMemberHealth,
} from "../../services/familySync";
import { FamilyMember } from "../../types/FamilyMember";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAge(dob?: any): string {
  if (!dob || typeof dob !== "string") return "--";
  try {
    let date: Date;
    if (dob.includes("/")) {
      const [d, m, y] = dob.split("/").map(Number);
      date = new Date(y < 100 ? 2000 + y : y, m - 1, d);
    } else {
      date = new Date(dob);
    }
    const age = Math.floor(
      (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000)
    );
    return age > 0 && age < 130 ? `${age}` : "--";
  } catch {
    return "--";
  }
}

function getInitials(member: Partial<FamilyMember>): string {
  const first = (member.firstName ?? "").charAt(0).toUpperCase();
  const last  = (member.lastName  ?? "").charAt(0).toUpperCase();
  return first + last || "?";
}

// ─── Reusable Section ─────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
  c,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  c: any;
}) {
  return (
    <View style={[styles.section, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconBg, { backgroundColor: c.accent + "18" }]}>
          <Ionicons name={icon} size={16} color={c.accent} />
        </View>
        <Text style={[styles.sectionTitle, { color: c.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoRow({
  label,
  value,
  icon,
  c,
}: {
  label: string;
  value: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  c: any;
}) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: c.border }]}>
      <Text style={[styles.infoLabel, { color: c.sub }]}>{label}</Text>
      <View style={styles.infoValueRow}>
        {icon ? (
          <MaterialCommunityIcons name={icon} size={14} color={c.sub} style={{ marginRight: 4 }} />
        ) : null}
        <Text style={[styles.infoValue, { color: c.text }]}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MemberDetailsScreen() {
  const { theme } = useTheme();
  const c = globalColors[theme];

  // ── Custom Alert State ──────────────────────────────────────────────────────
  const [customAlert, setCustomAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[];
  } | null>(null);

  const Alert = {
    alert: (
      title: string,
      message?: string,
      buttons?: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[]
    ) => {
      setCustomAlert({
        visible: true,
        title,
        message: message || "",
        buttons: buttons || [{ text: "OK" }],
      });
    }
  };

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const memberId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";

  const {
    members,
    getMemberById,
    isLoaded,
    switchToMember,
    isSwitched,
    activeMemberId,
    switchToSelf,
  } = useFamily();

  // Base member from context (has name/relation but may lack live health data)
  const baseMember = getMemberById(memberId) ??
    members.find((m) => m.id?.toString() === memberId || m.uid?.toString() === memberId);

  const memberUid = baseMember?.uid ?? baseMember?.id ?? memberId;

  // Live-fetched health data merged on top of base member
  const [liveData, setLiveData]   = useState<Partial<FamilyMember> | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  // ── Load initial data ──────────────────────────────────────────────────────
  const loadHealthData = useCallback(async () => {
    if (!memberUid) { setLoading(false); return; }
    try {
      const data = await fetchMemberHealthData(memberUid);
      setLiveData(data);
    } catch (e) {
      console.log("❌ MemberDetails fetchMemberHealthData error:", e);
    } finally {
      setLoading(false);
    }
  }, [memberUid]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const loadDataAndSubscribe = async () => {
      try {
        const data = await fetchMemberHealthData(memberUid);
        if (!active) return;
        setLiveData(data);
      } catch (e) {
        console.log("❌ MemberDetails fetchMemberHealthData error:", e);
      } finally {
        if (active) setLoading(false);
      }

      if (memberUid && active) {
        const unsub = subscribeToMemberHealth(memberUid, (update) => {
          if (active && update) {
            setLiveData((prev) => ({ ...(prev ?? {}), ...update }));
          }
        });
        if (!active) {
          unsub();
        } else {
          unsubRef.current = unsub;
        }
      }
    };

    if (memberUid) {
      loadDataAndSubscribe();
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
      if (unsubRef.current) unsubRef.current();
    };
  }, [memberUid]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHealthData();
    setRefreshing(false);
  }, [loadHealthData]);

  // ── Merged member data ─────────────────────────────────────────────────────
  const member: Partial<FamilyMember> = { ...(baseMember ?? {}), ...(liveData ?? {}) };

  const fullName =
    `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() ||
    member.name ||
    "Family Member";
  const relation = member.relation ?? member.relationship ?? "Family";
  const age      = getAge(member.dateOfBirth ?? member.dob);

  const isThisMemberActive = isSwitched && activeMemberId === memberUid;

  // ── Handle switch ──────────────────────────────────────────────────────────
  const handleSwitchProfile = useCallback(async () => {
    if (isThisMemberActive) {
      await switchToSelf();
      return;
    }
    if (!baseMember) return;
    Alert.alert(
      "Switch Profile",
      `Switch to ${fullName}'s profile? All health data (medicines, symptoms, Clinical Twin) will reflect their account.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            await switchToMember(memberUid);
            router.back();
          },
        },
      ]
    );
  }, [isThisMemberActive, baseMember, fullName, switchToMember, switchToSelf]);

  // ── Loading / not-found states ─────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    );
  }

  if (!baseMember && !memberId) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Ionicons name="alert-circle-outline" size={60} color={c.danger ?? "#ef4444"} />
        <Text style={[styles.errorText, { color: c.text }]}>Member not found</Text>
        <Text style={[styles.errorSub, { color: c.sub }]}>
          Please go back and select a valid family member.
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      <View style={[styles.container, { backgroundColor: c.bg }]}>
        {/* ── Header ── */}
        <LinearGradient
          colors={theme === "dark" ? ["#1e3a5f", "#0c1929"] : ["#2563eb", "#7c3aed"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>

          {/* Avatar */}
          {member.profileImage ? (
            <Image source={{ uri: member.profileImage }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{getInitials(member)}</Text>
            </View>
          )}

          <Text style={styles.headerName}>{fullName}</Text>
          <Text style={styles.headerMeta}>
            {relation}{age !== "--" ? ` · ${age} yrs` : ""}{" "}
            {member.gender ? `· ${member.gender}` : ""}
          </Text>

          {/* Switch Profile Button */}
          <TouchableOpacity
            style={[
              styles.switchBtn,
              isThisMemberActive
                ? { backgroundColor: "rgba(239,68,68,0.25)" }
                : { backgroundColor: "rgba(255,255,255,0.2)" },
            ]}
            onPress={handleSwitchProfile}
          >
            <Ionicons
              name={isThisMemberActive ? "swap-horizontal" : "swap-horizontal-outline"}
              size={15}
              color="#fff"
            />
            <Text style={styles.switchBtnText}>
              {isThisMemberActive ? "Back to My Profile" : "Switch Profile"}
            </Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* ── Content ── */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.accent}
              colors={[c.accent]}
            />
          }
        >
          {loading && !liveData ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={c.accent} />
              <Text style={[styles.loadingText, { color: c.sub }]}>
                Loading live health data...
              </Text>
            </View>
          ) : null}

          {/* Personal Information */}
          <Section title="Personal Information" icon="person-outline" c={c}>
            <InfoRow label="Blood Group" value={member.bloodGroup ?? "--"} c={c} />
            <InfoRow label="Height"      value={member.height ? `${member.height} cm` : "--"} c={c} />
            <InfoRow label="Weight"      value={member.weight ? `${member.weight} kg` : "--"} c={c} />
            {member.dateOfBirth || member.dob ? (
              <InfoRow label="Date of Birth" value={member.dateOfBirth ?? member.dob ?? "--"} c={c} />
            ) : null}
          </Section>

          {/* Vital Signs */}
          <Section title="Vital Signs" icon="heart-outline" c={c}>
            <InfoRow
              label="Heart Rate"
              value={member.heartRate ? `${member.heartRate} bpm` : "--"}
              icon="heart-pulse"
              c={c}
            />
            <InfoRow
              label="SpO₂"
              value={member.spo2 ? `${member.spo2}%` : "--"}
              icon="pulse"
              c={c}
            />
            <InfoRow
              label="Blood Pressure"
              value={member.bloodPressure ?? "--"}
              icon="gauge"
              c={c}
            />
            <InfoRow
              label="Temperature"
              value={member.temperature ? `${member.temperature} °C` : "--"}
              icon="thermometer"
              c={c}
            />
          </Section>

          {/* Medicines */}
          <Section title="Medicines" icon="medkit-outline" c={c}>
            {member.medicines?.length ? (
              member.medicines.map((med: any, idx: number) => {
                const name = typeof med === "string" ? med : med.name ?? "Unknown";
                const dose = med.dosage ?? med.dose ?? "";
                const freq = med.frequency ?? "";
                return (
                  <View
                    key={`med-${idx}`}
                    style={[styles.listItem, { borderLeftColor: "#f59e0b" }]}
                  >
                    <MaterialCommunityIcons name="pill" size={16} color="#f59e0b" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.listItemTitle, { color: c.text }]}>{name}</Text>
                      {(dose || freq) ? (
                        <Text style={[styles.listItemSub, { color: c.sub }]}>
                          {[dose, freq].filter(Boolean).join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.emptyText, { color: c.sub }]}>No medicines recorded</Text>
            )}
          </Section>

          {/* Active Symptoms */}
          <Section title="Active Symptoms" icon="fitness-outline" c={c}>
            {member.symptoms?.length ? (
              member.symptoms.map((sym: any, idx: number) => {
                const name     = sym.name ?? sym ?? "Unknown";
                const severity = sym.severity ?? "";
                const sevColor =
                  severity === "severe" || severity === "emergency"
                    ? "#ef4444"
                    : severity === "moderate"
                    ? "#f59e0b"
                    : "#22c55e";
                return (
                  <View key={`sym-${idx}`} style={[styles.listItem, { borderLeftColor: sevColor }]}>
                    <MaterialCommunityIcons name="stethoscope" size={16} color={sevColor} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.listItemTitle, { color: c.text }]}>{name}</Text>
                      {severity ? (
                        <View style={[styles.severityBadge, { backgroundColor: sevColor + "20" }]}>
                          <Text style={[styles.severityText, { color: sevColor }]}>
                            {severity.charAt(0).toUpperCase() + severity.slice(1)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.emptyText, { color: c.sub }]}>No active symptoms</Text>
            )}
          </Section>

          {/* Lifestyle */}
          <Section title="Activity & Hydration" icon="water-outline" c={c}>
            <InfoRow
              label="Daily Steps"
              value={member.steps ? member.steps.toLocaleString() : "--"}
              icon="shoe-print"
              c={c}
            />
            <InfoRow
              label="Calories"
              value={member.calories ? `${member.calories} kcal` : "--"}
              icon="fire"
              c={c}
            />
            <InfoRow
              label="Hydration"
              value={member.hydration ? `${member.hydration} ml` : "--"}
              icon="water"
              c={c}
            />
          </Section>

          {/* Last Updated */}
          {member.updatedAt ? (
            <Text style={[styles.updatedAt, { color: c.sub }]}>
              Last updated: {new Date(member.updatedAt).toLocaleString()}
            </Text>
          ) : null}
        </ScrollView>
      </View>

      {/* Themed Custom Alert Modal */}
      <Modal
        visible={customAlert !== null && customAlert.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomAlert(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center"
          }}
          onPress={() => setCustomAlert(null)}
        >
          <Pressable
            style={{
              backgroundColor: c.card,
              borderRadius: 24,
              padding: 20,
              width: "85%",
              maxWidth: 320,
              borderWidth: 1,
              borderColor: c.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.2,
              shadowRadius: 20,
              elevation: 10
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                marginBottom: 8,
                color: c.text,
                textAlign: 'center'
              }}
            >
              {customAlert?.title}
            </Text>
            {customAlert?.message ? (
              <Text
                style={{
                  fontSize: 14,
                  color: c.sub,
                  textAlign: 'center',
                  marginBottom: 16
                }}
              >
                {customAlert.message}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: customAlert?.buttons && customAlert.buttons.length > 2 ? 'column' : 'row',
                justifyContent: 'center',
                gap: 10,
                width: '100%'
              }}
            >
              {customAlert?.buttons.map((btn, idx) => {
                const isDestructive = btn.style === 'destructive';
                const isCancel = btn.style === 'cancel';
                const isStack = customAlert.buttons.length > 2;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      {
                        padding: 14,
                        borderRadius: 12,
                        alignItems: "center"
                      },
                      isDestructive
                        ? { backgroundColor: '#ef4444' }
                        : isCancel
                        ? { backgroundColor: c.border }
                        : { backgroundColor: c.accent },
                      isStack && { width: '100%', justifyContent: 'center' },
                      !isStack && { flex: 1 }
                    ]}
                    onPress={() => {
                      setCustomAlert(null);
                      if (btn.onPress) btn.onPress();
                    }}
                  >
                    <Text
                      style={{
                        color: isCancel ? c.text : '#fff',
                        fontWeight: 'bold',
                        fontSize: 14,
                        textAlign: 'center'
                      }}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
    textAlign: "center",
  },
  errorSub: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 6,
  },
  headerGradient: {
    paddingTop: 52,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    position: "relative",
  },
  backBtn: {
    position: "absolute",
    top: 52,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.6)",
    marginBottom: 10,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.5)",
    marginBottom: 10,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
  },
  headerName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  headerMeta: {
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    marginTop: 4,
    textAlign: "center",
  },
  switchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  switchBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    paddingVertical: 8,
    marginBottom: 4,
  },
  loadingText: {
    fontSize: 13,
  },
  section: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  sectionIconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderRadius: 4,
    marginBottom: 8,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  listItemSub: {
    fontSize: 12,
    marginTop: 2,
  },
  severityBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  severityText: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyText: {
    fontStyle: "italic",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 8,
  },
  updatedAt: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 4,
  },
});