import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFamily } from "../context/FamilyContext";
import { FamilyMember } from "../types/FamilyMember";
import {
  fetchMemberHealthData,
  subscribeToMemberHealth,
} from "../services/familySync";

export default function MemberHealthScreen() {
  const params = useLocalSearchParams<{
    userId?: string | string[];
    name?: string | string[];
  }>();

  const { getMemberById, isLoaded } = useFamily();

  const [firebaseData, setFirebaseData] =
    useState<Partial<FamilyMember> | null>(null);
  const [loadingFirebase, setLoadingFirebase] = useState(true);

  // Normalize route parameters
  const userId = Array.isArray(params.userId)
    ? params.userId[0]
    : params.userId;

  const nameParam = Array.isArray(params.name)
    ? params.name[0]
    : params.name;

  /* 🔹 Fetch data from Firebase */
  useEffect(() => {
    if (!userId) return;

    let active = true;
    let unsubscribe: (() => void) | undefined;

    const loadFirebaseData = async () => {
      try {
        setLoadingFirebase(true);

        const data = await fetchMemberHealthData(userId);
        if (!active) return;
        if (data) setFirebaseData(data);

        const unsub = subscribeToMemberHealth(userId, (updatedData) => {
          if (active && updatedData) {
            setFirebaseData(updatedData);
          }
        });

        if (!active) {
          unsub();
        } else {
          unsubscribe = unsub;
        }
      } catch (error) {
        console.error("❌ Error syncing Firebase data:", error);
      } finally {
        if (active) setLoadingFirebase(false);
      }
    };

    loadFirebaseData();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);

  /* 🔹 Wait for context to load */
  if (!isLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text style={styles.loadingText}>Loading member data...</Text>
      </View>
    );
  }

  /* 🔹 Fetch local member */
  const localMember = userId ? getMemberById(userId) : undefined;

  /* 🔹 Merge local and Firebase data */
  const member: any = localMember
    ? { ...localMember, ...firebaseData }
    : undefined;

  /* 🔹 Handle member not found */
  if (!member) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={60} color="red" />
        <Text style={styles.errorText}>Member not found</Text>
        <Text style={styles.subErrorText}>
          Please select a valid family member.
        </Text>
      </View>
    );
  }

  const displayName =
    nameParam ||
    `${member.firstName || ""} ${member.lastName || ""}`.trim() ||
    member.name ||
    "Family Member";

  const relation =
    member.relation || member.relationship || "Family";

  const dateOfBirth =
    member.dateOfBirth || member.dob || "--";

  return (
    <>
      <Stack.Screen options={{ title: "Family Member Details" }} />
      <ScrollView style={styles.container}>
        {/* Header */}
        <LinearGradient
          colors={["#0ea5e9", "#0284c7"]}
          style={styles.header}
        >
          <Ionicons name="person-circle" size={90} color="#fff" />
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.subText}>
            {relation} • DOB: {dateOfBirth}
          </Text>
        </LinearGradient>

        {/* Personal Information */}
        <Section title="Personal Information" icon="person-outline">
          <Info label="Date of Birth" value={dateOfBirth} />
          <Info label="Weight" value={`${member.weight || "--"} `} />
          <Info label="Blood Group" value={member.bloodGroup || "--"} />
          <Info label="Gender" value={member.gender || "--"} />
          <Info label="Height" value={`${member.height || "--"} `} />
        </Section>

        {/* Vital Signs */}
        <Section title="Vital Signs" icon="heart-outline">
          <Info label="Heart Rate" value={`${member.heartRate || "--"} bpm`} />
          <Info label="SpO₂" value={`${member.spo2 || "--"} %`} />
          <Info label="Steps" value={`${member.steps || 0}`} />
          <Info
            label="Calories"
            value={`${member.calories || 0} kcal`}
          />
        </Section>

        {/* Medicines */}
        <Section title="Medicines" icon="medkit-outline">
          {Array.isArray(member.medicines) &&
          member.medicines.length > 0 ? (
            member.medicines.map((med: any, index: number) => {
              const name = med?.name || "Unknown Medicine";
              const dosage = med?.dosage || med?.dose || "";
              const frequency = med?.frequency || "";
              const time = med?.time || "";
              const type = med?.type ? ` (${med.type})` : "";

              return (
                <View key={index} style={styles.medicineItem}>
                  <Text style={styles.listItem}>
                    💊 {name}
                    {dosage ? ` - ${dosage}` : ""}
                    {type}
                  </Text>
                  {(frequency || time) && (
                    <Text style={styles.medicineSubText}>
                      {frequency && `Frequency: ${frequency}`}
                      {frequency && time ? " | " : ""}
                      {time && `Time: ${time}`}
                    </Text>
                  )}
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyText}>No medicines added</Text>
          )}
        </Section>

        {/* Symptoms */}
        <Section title="Symptoms" icon="fitness-outline">
          {Array.isArray(member.symptoms) &&
          member.symptoms.length > 0 ? (
            member.symptoms.map((sym: any, index: number) => (
              <View key={index} style={styles.medicineItem}>
                <Text style={styles.listItem}>
                  🩺 {sym?.name || "Unknown"} (
                  {sym?.severity || "N/A"})
                </Text>
                {sym?.date && (
                  <Text style={styles.medicineSubText}>
                    Date: {sym.date}
                  </Text>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No active symptoms</Text>
          )}
        </Section>

        {/* Hydration */}
        <Section title="Hydration" icon="water-outline">
          <Info label="Water Intake" value={`${member.hydration || 0} ml`} />
        </Section>

        {loadingFirebase && (
          <Text style={styles.syncText}>Syncing with Firebase...</Text>
        )}
      </ScrollView>
    </>
  );
}

/* ---------- Reusable Components ---------- */

const Section = ({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={20} color="#0ea5e9" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

const Info = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  header: {
    alignItems: "center",
    paddingVertical: 25,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  name: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 5,
  },
  subText: {
    color: "#e0f2fe",
    fontSize: 14,
  },
  section: {
    backgroundColor: "#fff",
    margin: 15,
    padding: 15,
    borderRadius: 12,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
    color: "#0f172a",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  label: {
    color: "#64748b",
  },
  value: {
    fontWeight: "600",
    color: "#0f172a",
  },
  listItem: {
    fontSize: 14,
    color: "#0f172a",
  },
  medicineItem: {
    marginBottom: 8,
  },
  medicineSubText: {
    fontSize: 12,
    color: "#64748b",
    marginLeft: 5,
  },
  emptyText: {
    color: "#94a3b8",
    fontStyle: "italic",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    color: "red",
    marginTop: 10,
    fontWeight: "bold",
  },
  subErrorText: {
    color: "#64748b",
    marginTop: 5,
  },
  loadingText: {
    fontSize: 16,
    color: "#64748b",
    marginTop: 10,
  },
  syncText: {
    textAlign: "center",
    marginBottom: 20,
    color: "#0ea5e9",
    fontSize: 12,
  },
});