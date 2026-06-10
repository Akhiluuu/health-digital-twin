import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
} from "react-native";
import Header from "./components/Header";
import { useTheme } from "../context/ThemeContext";
import { colors as globalColors } from "../theme/colors";

export default function DataSharing() {
  const [vitals, setVitals] = useState(true);
  const [bio, setBio] = useState(false);
  const [location, setLocation] = useState(true);

  const { theme } = useTheme();

  const colors = globalColors[theme];

  const Row = (
    title: string,
    desc: string,
    value: boolean,
    set: any
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
      <View style={{ flex: 1, paddingRight: 10 }}>
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
        onValueChange={set}
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
      <Header />

      <ScrollView
        contentContainerStyle={styles.content}
      >
        <Text
          style={[
            styles.header,
            { color: colors.sub },
          ]}
        >
          Health Cloud Sync — encrypted sharing
        </Text>

        {Row(
          "Vitals Data",
          "Heart rate, SpO2, sleep",
          vitals,
          setVitals
        )}

        {Row(
          "Biometric Profile",
          "Age, weight, genetics",
          bio,
          setBio
        )}

        {Row(
          "Location Data",
          "Regional alerts",
          location,
          setLocation
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  content: {
    paddingTop: 110,
    padding: 16,
  },

  header: {
    marginBottom: 20,
  },

  row: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
  },

  title: {
    fontWeight: "bold",
  },

  desc: {
    marginTop: 4,
  },
});
