import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Header from "./components/Header";
import { useTheme } from "../context/ThemeContext";
import { colors as globalColors } from "../theme/colors";

export default function DataSharing() {
  const { theme } = useTheme();
  const colors = globalColors[theme];

  const [vitals, setVitals] = useState(true);
  const [bio, setBio] = useState(false);
  const [location, setLocation] = useState(true);
  const [loading, setLoading] = useState(true);

  // ── Load stored settings ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const storedVitals = await AsyncStorage.getItem("@data_share_vitals");
        const storedBio = await AsyncStorage.getItem("@data_share_biometric");
        const storedLocation = await AsyncStorage.getItem("@data_share_location");

        if (storedVitals !== null) setVitals(storedVitals === "true");
        if (storedBio !== null) setBio(storedBio === "true");
        if (storedLocation !== null) setLocation(storedLocation === "true");
      } catch (e) {
        console.error("Failed to load data sharing settings:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Save helpers ────────────────────────────────────────────────────────
  const handleToggleVitals = async (val: boolean) => {
    setVitals(val);
    try {
      await AsyncStorage.setItem("@data_share_vitals", String(val));
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleBio = async (val: boolean) => {
    setBio(val);
    try {
      await AsyncStorage.setItem("@data_share_biometric", String(val));
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleLocation = async (val: boolean) => {
    setLocation(val);
    try {
      await AsyncStorage.setItem("@data_share_location", String(val));
    } catch (e) {
      console.error(e);
    }
  };

  const Row = (
    title: string,
    desc: string,
    value: boolean,
    onToggle: (val: boolean) => void
  ) => (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text
          style={[
            styles.title,
            { color: colors.text },
          ]}
        >
          {title}
        </Text>

        <Text
          style={[
            styles.desc,
            { color: colors.sub },
          ]}
        >
          {desc}
        </Text>
      </View>

      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor={value ? "#ffffff" : "#f4f3f4"}
      />
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.bg },
      ]}
    >
      <Header title="Data Sharing" showBack={true} showProfile={false} />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={[
              styles.headerText,
              { color: colors.sub },
            ]}
          >
            Manage what health information is synced to the Firebase Cloud backup. Toggling a setting off disables cloud sync for that specific category.
          </Text>

          {Row(
            "Vitals Data",
            "Sync heart rate, SpO2, sleep tracker, steps, activity history and water intake.",
            vitals,
            handleToggleVitals
          )}

          {Row(
            "Biometric Profile",
            "Sync body measurements, BioGears simulation history and metadata.",
            bio,
            handleToggleBio
          )}

          {Row(
            "Location Data",
            "Use location permissions for regional alerts and location-aware insights.",
            location,
            handleToggleLocation
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  content: {
    paddingTop: 100,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  headerText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },

  row: {
    padding: 18,
    borderRadius: 16,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
  },

  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },

  desc: {
    fontSize: 13,
    lineHeight: 18,
  },
});
