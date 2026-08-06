// app/symptom-history.tsx

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Symptom, useSymptoms } from "../context/SymptomContext";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";

export default function SymptomHistory() {
  const router = useRouter();
  const { theme } = useTheme();
  const { historySymptoms, removeSymptom, clearHistory } = useSymptoms();
  const c = colors[theme];

  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [selectedSymptom, setSelectedSymptom] =
    useState<Symptom | null>(null);
  const [modalVisible, setModalVisible] =
    useState(false);

  useFocusEffect(
    useCallback(() => {
      setSymptoms(historySymptoms);
    }, [historySymptoms])
  );

  const handleClearAll = () => {
    Alert.alert(
      "Clear Symptom History",
      "Are you sure you want to clear your entire symptom history?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            await clearHistory();
          },
        },
      ]
    );
  };

  const handleDeleteSymptom = async (
    id: number
  ) => {
    Alert.alert(
      "Delete Symptom",
      "Are you sure you want to delete this symptom?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await removeSymptom(id);
            setModalVisible(false);
          },
        },
      ]
    );
  };

  const getSeverityColor = (
    severity?: string
  ) => {
    switch (String(severity || '').toLowerCase()) {
      case "mild":
        return "#22c55e";
      case "moderate":
        return "#f59e0b";
      case "severe":
      case "emergency":
        return "#ef4444";
      default:
        return c.sub;
    }
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString();

  //////////////////////////////////////////////////////
  // RENDER LIST ITEM
  //////////////////////////////////////////////////////

  const renderSymptomItem = ({
    item,
  }: {
    item: Symptom;
  }) => (
    <TouchableOpacity
      style={[
        styles.symptomCard,
        { backgroundColor: c.card },
      ]}
      onPress={() => {
        setSelectedSymptom(item);
        setModalVisible(true);
      }}
      onLongPress={() =>
        handleDeleteSymptom(item.id)
      }
    >
      <View style={styles.symptomHeader}>
        <Text
          style={[
            styles.symptomName,
            { color: c.text },
          ]}
        >
          {item.name}
        </Text>

        <View
          style={[
            styles.severityBadge,
            {
              backgroundColor:
                getSeverityColor(item.severity),
            },
          ]}
        >
          <Text style={styles.severityText}>
            {item.severity}
          </Text>
        </View>
      </View>

      <Text
        style={[
          styles.symptomDate,
          { color: c.sub },
        ]}
      >
        Started: {formatDate(item.startedAt)}
      </Text>
    </TouchableOpacity>
  );

  //////////////////////////////////////////////////////
  // PARSE ANSWERS SAFELY
  //////////////////////////////////////////////////////

  const renderFollowUpAnswers = () => {
    if (
      !selectedSymptom?.followUpAnswers
    )
      return null;

    try {
      const parsed = JSON.parse(
        selectedSymptom.followUpAnswers
      );

      return (
        <View style={{ marginTop: 20 }}>
          <Text
            style={[
              styles.sectionTitle,
              { color: c.text },
            ]}
          >
            Your Responses
          </Text>

          {/* Selected Options */}
          {parsed.options &&
            parsed.options.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text
                  style={[
                    styles.label,
                    { color: c.text },
                  ]}
                >
                  Selected Symptoms:
                </Text>
                {parsed.options.map(
                  (opt: string, index: number) => (
                    <Text
                      key={index}
                      style={{
                        color: c.sub,
                        marginLeft: 10,
                      }}
                    >
                      • {opt}
                    </Text>
                  )
                )}
              </View>
            )}

          {/* Other Answers */}
          {Object.entries(parsed)
            .filter(
              ([key]) => key !== "options"
            )
            .map(([key, value]) => (
              <View
                key={key}
                style={{ marginTop: 10 }}
              >
                <Text
                  style={[
                    styles.label,
                    { color: c.text },
                  ]}
                >
                  {key}
                </Text>
                <Text
                  style={{
                    color: c.sub,
                  }}
                >
                  {String(value)}
                </Text>
              </View>
            ))}
        </View>
      );
    } catch {
      return null;
    }
  };

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: c.bg,
      }}
    >
      <View
        style={[
          styles.header,
          {
            backgroundColor: c.bg,
            borderBottomColor: c.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={c.text}
          />
        </TouchableOpacity>

        <Text
          style={[
            styles.headerTitle,
            { color: c.text },
          ]}
        >
          Symptom History
        </Text>

        {symptoms.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll}>
            <Ionicons name="trash-outline" size={22} color="#ef4444" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <FlatList
        data={symptoms}
        keyExtractor={(item) =>
          item.id.toString()
        }
        renderItem={renderSymptomItem}
        contentContainerStyle={{
          padding: 16,
          flexGrow: 1,
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={48} color={c.sub} />
            <Text style={[styles.emptyText, { color: c.sub }]}>
              No symptom history found
            </Text>
          </View>
        }
      />

      {/* MODAL */}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={[
              styles.modalContent,
              { backgroundColor: c.card },
            ]}
          >
            {selectedSymptom && (
              <>
                <Text
                  style={[
                    styles.modalTitle,
                    { color: c.text },
                  ]}
                >
                  {selectedSymptom.name}
                </Text>

                <Text
                  style={{
                    color: c.sub,
                    marginTop: 10,
                  }}
                >
                  Severity:{" "}
                  {selectedSymptom.severity}
                </Text>

                <Text
                  style={{
                    color: c.sub,
                    marginTop: 4,
                  }}
                >
                  Started:{" "}
                  {formatDate(
                    selectedSymptom.startedAt
                  )}
                </Text>

                {selectedSymptom.resolvedAt && (
                  <Text
                    style={{
                      color: c.sub,
                      marginTop: 4,
                    }}
                  >
                    Resolved:{" "}
                    {formatDate(
                      selectedSymptom.resolvedAt
                    )}
                  </Text>
                )}

                {renderFollowUpAnswers()}

                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() =>
                    setModalVisible(false)
                  }
                >
                  <Text
                    style={{
                      color: c.sub,
                    }}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

////////////////////////////////////////////////////////
// STYLES
////////////////////////////////////////////////////////

const styles = StyleSheet.create({
  header: {
    padding: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  symptomCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  symptomHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  symptomName: {
    fontSize: 16,
    fontWeight: "600",
  },
  severityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  severityText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  symptomDate: {
    marginTop: 6,
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor:
      "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    padding: 20,
    borderRadius: 20,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  closeButton: {
    marginTop: 20,
    alignItems: "center",
    padding: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
  },
});