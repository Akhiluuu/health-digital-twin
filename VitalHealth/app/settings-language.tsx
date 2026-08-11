import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";

import Header from "./components/Header";
import { useTheme } from "../context/ThemeContext";
import { colors as globalColors } from "../theme/colors";
import { useStackBackHandler } from "../hooks/useStackBackHandler";

const langs = [
  "English",
  "Telugu",
  "Hindi",
  "Kannada",
  "Tamil",
  "Malayalam",
];

export default function Language() {
  useStackBackHandler();
  const { theme } = useTheme();

  const [selected, setSelected] =
    useState("English");

  const colors = globalColors[theme];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.bg },
      ]}
    >
      <Header />

      <View style={{ paddingTop: 110 }}>
        {langs.map(lang => {
          const active =
            selected === lang;

          return (
            <TouchableOpacity
              key={lang}
              style={[
                styles.item,
                {
                  backgroundColor:
                    active
                      ? colors.card
                      : "transparent",
                  borderColor: colors.border,
                },
              ]}
              onPress={() =>
                setSelected(lang)
              }
            >
              <Text
                style={[
                  styles.text,
                  {
                    color: active
                      ? colors.accent
                      : colors.text,
                  },
                ]}
              >
                {lang}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  item: {
    padding: 18,
    borderBottomWidth: 1,
  },

  text: {
    fontSize: 16,
    fontWeight: "500",
  },
});
