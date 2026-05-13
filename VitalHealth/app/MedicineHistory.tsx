// app/MedicineHistory.tsx

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import Header from "./components/Header";

///////////////////////////////////////////////////////////

export type MedicineHistoryEntry = {
  id: string;
  medicineId: number;
  medicineName: string;
  dose: string;
  time: string;
  date: string;
  takenAt: string;
  status: "taken" | "skipped" | "late" | "scheduled" | "deleted";
};

const HISTORY_STORAGE_KEY = "medicine_history";

///////////////////////////////////////////////////////////

export default function MedicineHistory() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = colors[theme];

  const [history, setHistory] = useState<MedicineHistoryEntry[]>([]);
  const [selectedEntry, setSelectedEntry] =
    useState<MedicineHistoryEntry | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  /////////////////////////////////////////////////////////
  // LOAD HISTORY
  /////////////////////////////////////////////////////////

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    try {
      const saved = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);

      if (!saved) {
        setHistory([]);
        return;
      }

      const parsed: MedicineHistoryEntry[] = JSON.parse(saved);

      parsed.sort(
        (a, b) =>
          new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime()
      );

      setHistory(parsed);
    } catch (error) {
      console.error("❌ Error loading history:", error);
      setHistory([]);
    }
  };

  /////////////////////////////////////////////////////////
  // DELETE SINGLE ENTRY
  /////////////////////////////////////////////////////////

  const handleDeleteEntry = async (id: string) => {
    const updated = history.filter((entry) => entry.id !== id);
    await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
    setHistory(updated);
    setModalVisible(false);
  };

  /////////////////////////////////////////////////////////
  // CLEAR ALL
  /////////////////////////////////////////////////////////

  const handleClearAll = async () => {
    Alert.alert("Clear All History", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem(HISTORY_STORAGE_KEY);
          setHistory([]);
        },
      },
    ]);
  };

  /////////////////////////////////////////////////////////
  // STATUS HELPERS
  /////////////////////////////////////////////////////////

  const getStatusColor = (status: string) => {
    switch (status) {
      case "taken":   return "#22c55e";
      case "late":    return "#f59e0b";
      case "skipped": return "#ef4444";
      case "deleted": return "#6b7280";
      default:        return c.sub;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "taken":   return "checkmark-circle";
      case "late":    return "time";
      case "skipped": return "close-circle";
      case "deleted": return "trash";
      default:        return "help-circle";
    }
  };

  /////////////////////////////////////////////////////////
  // UI
  /////////////////////////////////////////////////////////

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <Header />

      <View style={styles.container}>
        {/* Header row */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={c.text} />
          </TouchableOpacity>

          <Text style={[styles.title, { color: c.text }]}>
            Medicine History
          </Text>

          <TouchableOpacity onPress={handleClearAll}>
            <Ionicons name="trash-outline" size={24} color="#ef4444" />
          </TouchableOpacity>
        </View>

        {/* History list */}
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={[styles.emptyState, { backgroundColor: c.card }]}>
              <Ionicons name="time-outline" size={48} color={c.sub} />
              <Text style={[styles.emptyText, { color: c.sub }]}>
                No medicine history yet
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.historyCard, { backgroundColor: c.card }]}
              onPress={() => {
                setSelectedEntry(item);
                setModalVisible(true);
              }}
            >
              <View style={styles.row}>
                <View>
                  <Text style={[styles.medicineName, { color: c.text }]}>
                    {item.medicineName}
                  </Text>
                  <Text style={{ color: c.sub }}>{item.dose}</Text>
                </View>

                <Ionicons
                  name={getStatusIcon(item.status)}
                  size={24}
                  color={getStatusColor(item.status)}
                />
              </View>

              <Text style={{ color: c.sub, marginTop: 6 }}>
                {new Date(item.takenAt).toLocaleString()}
              </Text>
            </TouchableOpacity>
          )}
        />

        {/* ✅ FIXED: was // comment lines inside JSX — caused the
            "Text strings must be rendered within a <Text>" crash */}
        <Modal visible={modalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: c.card }]}>
              {selectedEntry && (
                <>
                  <Text style={[styles.modalTitle, { color: c.text }]}>
                    {selectedEntry.medicineName}
                  </Text>

                  <Text style={{ color: c.sub }}>
                    Dose: {selectedEntry.dose}
                  </Text>

                  <Text style={{ color: c.sub }}>
                    Time: {selectedEntry.time}
                  </Text>

                  <Text style={{ color: c.sub }}>
                    Status: {selectedEntry.status.toUpperCase()}
                  </Text>

                  <Text style={{ color: c.sub }}>
                    Logged At:{" "}
                    {new Date(selectedEntry.takenAt).toLocaleString()}
                  </Text>

                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteEntry(selectedEntry.id)}
                  >
                    <Text style={{ color: "#fff" }}>Delete Entry</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Text style={{ marginTop: 12, color: c.sub }}>
                      Close
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

////////////////////////////////////////////////////////////

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: 16, paddingTop: 90 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },

  title: { fontSize: 22, fontWeight: "700" },

  historyCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  medicineName: {
    fontSize: 16,
    fontWeight: "600",
  },

  emptyState: {
    alignItems: "center",
    padding: 40,
    borderRadius: 20,
    marginTop: 30,
  },

  emptyText: {
    marginTop: 12,
    fontSize: 16,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalContent: {
    width: "85%",
    padding: 20,
    borderRadius: 20,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },

  deleteButton: {
    backgroundColor: "#ef4444",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
});