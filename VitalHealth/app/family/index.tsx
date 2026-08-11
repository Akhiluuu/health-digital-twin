// app/family/index.tsx
// Production-level Family Health overview screen
// – Theme-aware, live member data, proper keys, pull-to-refresh

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  StatusBar,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useFamily } from "../../context/FamilyContext";
import { useTheme } from "../../context/ThemeContext";
import { colors as globalColors } from "../../theme/colors";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { FamilyMember } from "../../types/FamilyMember";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAge(dob?: any): string {
  if (!dob || typeof dob !== "string") return "--";
  try {
    // Support DD/MM/YYYY and YYYY-MM-DD
    let date: Date;
    if (dob.includes("/")) {
      const [d, m, y] = dob.split("/").map(Number);
      const year = y < 100 ? 2000 + y : y;
      date = new Date(year, m - 1, d);
    } else {
      date = new Date(dob);
    }
    const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000));
    return age > 0 && age < 130 ? `${age}` : "--";
  } catch {
    return "--";
  }
}

function getInitials(member: FamilyMember): string {
  const first = (member.firstName ?? "").charAt(0).toUpperCase();
  const last  = (member.lastName  ?? "").charAt(0).toUpperCase();
  return first + last || "?";
}

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({
  item,
  c,
  onPress,
}: {
  item: FamilyMember;
  c: any;  // theme colors object from globalColors[theme]
  onPress: () => void;
}) {
  const fullName = `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim() || item.name || "Family Member";
  const relation = item.relation ?? item.relationship ?? "Family";
  const age      = getAge(item.dateOfBirth ?? item.dob);
  const medCount = item.medicines?.length ?? 0;
  const symCount = item.symptoms?.length ?? 0;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {/* Avatar */}
      {item.profileImage ? (
        <Image source={{ uri: item.profileImage }} style={styles.avatar} />
      ) : (
        <LinearGradient
          colors={[c.accent + "cc", c.accent]}
          style={styles.avatarPlaceholder}
        >
          <Text style={styles.avatarText}>{getInitials(item)}</Text>
        </LinearGradient>
      )}

      {/* Info */}
      <View style={styles.cardContent}>
        <Text style={[styles.memberName, { color: c.text }]} numberOfLines={1}>
          {fullName}
        </Text>
        <Text style={[styles.memberMeta, { color: c.sub }]}>
          {relation}{age !== "--" ? ` · ${age} yrs` : ""}
        </Text>

        {/* Health badges */}
        <View style={styles.healthRow}>
          {/* Medicines */}
          <View style={[styles.badge, { backgroundColor: "#f59e0b18" }]}>
            <MaterialCommunityIcons name="pill" size={13} color="#f59e0b" />
            <Text style={[styles.badgeText, { color: "#f59e0b" }]}>
              {medCount} med{medCount !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* Symptoms */}
          <View style={[styles.badge, { backgroundColor: "#ef444418" }]}>
            <MaterialCommunityIcons name="stethoscope" size={13} color="#ef4444" />
            <Text style={[styles.badgeText, { color: "#ef4444" }]}>
              {symCount} symptom{symCount !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* Heart Rate */}
          {item.heartRate ? (
            <View style={[styles.badge, { backgroundColor: "#ec489918" }]}>
              <MaterialCommunityIcons name="heart-pulse" size={13} color="#ec4899" />
              <Text style={[styles.badgeText, { color: "#ec4899" }]}>
                {item.heartRate} bpm
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={c.sub} />
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FamilyHealthScreen() {
  const { theme } = useTheme();
  const c = globalColors[theme];
  const { members, isLoaded, refreshMembers } = useFamily();

  const [refreshing, setRefreshing] = useState(false);

  // Refresh when screen gains focus
  useFocusEffect(
    useCallback(() => {
      refreshMembers();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshMembers();
    setRefreshing(false);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FamilyMember }) => {
      // Build a unique, stable key — prefer uid (Firebase UID), fallback to id, then name
      const itemKey = item.uid ?? item.id ?? item.name ?? String(Math.random());
      return (
        <MemberCard
          key={itemKey}
          item={item}
          c={c}
          onPress={() =>
            router.push({
              pathname: "/family/member-details",
              params: { id: (item.uid ?? item.id ?? "").toString() },
            })
          }
        />
      );
    },
    [c]
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <StatusBar barStyle={theme === "dark" ? "light-content" : "dark-content"} />

      {/* Header */}
      <LinearGradient
        colors={
          theme === "dark"
            ? ["#1e3a5f", "#0c1929"]
            : ["#2563eb", "#7c3aed"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View>
          <Text style={styles.headerTitle}>Family Health</Text>
          <Text style={styles.headerSub}>
            {members.length} linked member{members.length !== 1 ? "s" : ""}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]}
          onPress={() => router.push("/family/add-member")}
        >
          <Ionicons name="person-add" size={18} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* List */}
      <FlatList<FamilyMember>
        data={members}
        keyExtractor={(item) => item.uid ?? item.id ?? item.name ?? String(Math.random())}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          members.length === 0 && { flex: 1 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.accent}
            colors={[c.accent]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <LinearGradient
              colors={["#2563eb22", "#7c3aed22"]}
              style={styles.emptyIcon}
            >
              <Ionicons name="people-outline" size={52} color={c.accent} />
            </LinearGradient>
            <Text style={[styles.emptyTitle, { color: c.text }]}>
              No Family Members Yet
            </Text>
            <Text style={[styles.emptySub, { color: c.sub }]}>
              Link a family member using their Health ID or QR code to monitor
              their health together.
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: c.accent }]}
              onPress={() => router.push("/family/add-member")}
            >
              <Ionicons name="person-add-outline" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Add First Member</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 52,
    paddingBottom: 20,
    paddingHorizontal: 20,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
  },
  headerSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  addBtn: {
    marginLeft: "auto",
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  cardContent: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "700",
  },
  memberMeta: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: 6,
  },
  healthRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});