import React, { useState, useRef, useEffect } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { getVaultStyles } from "./shared/VaultStyles";
import { useTheme } from "../../context/ThemeContext";
import { colors } from "../../theme/colors";

interface Message {
  sender: "user" | "assistant";
  text: string;
}

interface AssistantCompanionProps {
  messages: Message[];
  activeSymptoms: any[];
  onSendMessage: (text: string) => Promise<void>;
  onExportReport: () => void;
}

export default function AssistantCompanion({
  messages,
  activeSymptoms,
  onSendMessage,
  onExportReport,
}: AssistantCompanionProps) {
  const { theme } = useTheme();
  const c = colors[theme];
  const styles = getVaultStyles(c);

  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleSymptomSelect = (symptomName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput((prev) => (prev ? `${prev}, reporting ${symptomName}` : `I am feeling ${symptomName} today.`));
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollPadding, { paddingBottom: 20 }]}
        >
          {/* Clinical Passport Card - Simplified */}
          <View style={styles.scoreCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Ionicons name="document-text" size={24} color={c.accent} />
              <Text style={styles.scoreTitle}>Share Doctor Report</Text>
            </View>
            <Text style={[styles.scoreSub, { marginBottom: 12 }]}>
              Generate a clean, readable PDF report summarizing your daily adherence and active symptoms for your next doctor's visit.
            </Text>
            <TouchableOpacity
              style={[styles.reorderButton, { flexDirection: "row", justifyContent: "center", gap: 6, height: 40, alignItems: "center" }]}
              onPress={onExportReport}
            >
              <Ionicons name="share-social-outline" size={18} color="#ffffff" />
              <Text style={styles.reorderTxt}>Share PDF Report</Text>
            </TouchableOpacity>
          </View>

          {/* Chat Messages */}
          <Text style={styles.sectionTitle}>Conversational Intelligence</Text>
          <View style={{ gap: 10, marginBottom: 20 }}>
            {messages.map((msg, index) => {
              const isUser = msg.sender === "user";
              return (
                <View
                  key={index}
                  style={[
                    styles.messageBubble,
                    isUser ? styles.userBubble : styles.assistantBubble,
                    {
                      backgroundColor: isUser ? c.accent : c.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      {
                        color: isUser ? "#ffffff" : c.text,
                      },
                    ]}
                  >
                    {msg.text}
                  </Text>
                </View>
              );
            })}
          </View>


        </ScrollView>

        {/* Quick Symptom Chips */}
        {activeSymptoms && (
          <View>
            <Text style={[styles.sectionTitle, { fontSize: 11, color: c.sub, marginHorizontal: 16, marginTop: 4, marginBottom: 4 }]}>
              QUICK LOG SYMPTOMS
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.symptomShortcuts}>
              {["Nausea", "Headache", "Dizziness", "Fatigue", "Dry Cough", "Shortness of breath"].map((symptom) => (
                <TouchableOpacity
                  key={symptom}
                  style={[styles.symptomChip, { borderColor: c.border, backgroundColor: c.card }]}
                  onPress={() => handleSymptomSelect(symptom)}
                >
                  <Text style={[styles.symptomChipText, { color: c.text }]}>{symptom}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Message Input Box */}
        <View style={[styles.inputContainer, { borderTopColor: c.border, backgroundColor: c.card }]}>
          <TextInput
            placeholder="Ask Personal Health Assistant anything..."
            placeholderTextColor={c.placeholder}
            style={[styles.textInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: c.accent }]}
            onPress={handleSend}
          >
            <Ionicons name="send" size={16} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
