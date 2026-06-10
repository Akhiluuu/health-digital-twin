import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import Header from "./components/Header";
import { useTheme } from "../context/ThemeContext";
import { colors as globalColors } from "../theme/colors";

export default function Contacts() {
  const [name, setName] = useState("");
  const { theme } = useTheme();

  const colors = globalColors[theme];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.bg },
      ]}
    >
      <Header />

      <View style={styles.content}>
        <TextInput
          placeholder="Add Contact Name"
          placeholderTextColor={colors.sub}
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={name}
          onChangeText={setName}
        />

        <TouchableOpacity
          style={[
            styles.btn,
            { backgroundColor: colors.accent },
          ]}
        >
          <Text style={styles.btnText}>
            Add Contact
          </Text>
        </TouchableOpacity>
      </View>
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

  input: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
  },

  btn: {
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },

  btnText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
