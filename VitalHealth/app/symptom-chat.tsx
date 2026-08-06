// app/symptom-chat.tsx

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { useSymptoms } from "../context/SymptomContext"; // ✅ Added

interface Message {
  id: string;
  text: string;
  sender: "bot" | "user";
}

export default function SymptomChat() {
  const router = useRouter();
  const { query } = useLocalSearchParams<{ query?: string }>();
  const { theme } = useTheme();
  const { logCustomSymptom } = useSymptoms(); // ✅ Added

  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [diagnosisComplete, setDiagnosisComplete] = useState(false);

  const colors =
    theme === "light"
      ? {
          bg: "#f8fafc",
          card: "#ffffff",
          text: "#020617",
          sub: "#64748b",
          border: "#e2e8f0",
          accent: "#38bdf8",
        }
      : {
          bg: "#020617",
          card: "#0b1220",
          text: "#e2e8f0",
          sub: "#94a3b8",
          border: "#1e293b",
          accent: "#38bdf8",
        };

  /**
   * Generate follow-up diagnostic questions
   */
  const generateQuestions = (symptom: string): string[] => [
    `You reported: "${symptom}". How long have you been experiencing this?`,
    "On a scale of 1–10, how severe is the symptom?",
    "Do you have any additional symptoms?",
    "Have you experienced this before?",
    "Would you like AI-based health recommendations?",
  ];

  const [questions, setQuestions] = useState<string[]>([]);

  useEffect(() => {
    if (query) {
      const initialQuestions = generateQuestions(query);
      setQuestions(initialQuestions);

      setMessages([
        {
          id: "0",
          text: "Hello! I'm your AI Health Assistant.",
          sender: "bot",
        },
        {
          id: "1",
          text: initialQuestions[0],
          sender: "bot",
        },
      ]);
    }
  }, [query]);

  /**
   * Auto-scroll to the latest message
   */
  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  /**
   * Save symptom after diagnosis
   */
  const saveSymptom = async () => {
    try {
      if (query) {
        await logCustomSymptom(
          query.toString(),
          "moderate",
          undefined,
          answers.join(" | ")
        );
      }

      Alert.alert(
        "Symptom Logged",
        "Your symptom has been saved successfully.",
        [
          {
            text: "View Symptoms",
            onPress: () => router.push("/(tabs)"),
          },
          {
            text: "OK",
            style: "cancel",
          },
        ]
      );
    } catch (error) {
      console.error("Error logging symptom:", error);
      Alert.alert("Error", "Failed to save symptom.");
    }
  };

  /**
   * Handle user response
   */
  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      sender: "user",
    };

    setMessages((prev) => [...prev, userMessage]);
    setAnswers((prev) => [...prev, input]);
    setInput("");

    const nextStep = step + 1;
    setStep(nextStep);

    if (nextStep < questions.length) {
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: questions[nextStep],
        sender: "bot",
      };

      setTimeout(() => {
        setMessages((prev) => [...prev, botMessage]);
      }, 500);
    } else {
      const finalMessage: Message = {
        id: (Date.now() + 2).toString(),
        text:
          "Thank you! Connecting to VitalHealth AI Assistant for your comprehensive clinical assessment...",
        sender: "bot",
      };

      setDiagnosisComplete(true);

      setTimeout(async () => {
        setMessages((prev) => [...prev, finalMessage]);
        await saveSymptom();
        Alert.alert("Symptom Recorded", "Your symptom has been saved to your health history.", [
          { text: "OK", onPress: () => router.back() }
        ]);
      }, 800);
    }
  };

  /**
   * Render chat bubbles
   */
  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === "user";
    return (
      <View
        style={[
          styles.messageBubble,
          {
            alignSelf: isUser ? "flex-end" : "flex-start",
            backgroundColor: isUser
              ? colors.accent
              : colors.card,
          },
        ]}
      >
        <Text
          style={{
            color: isUser ? "#fff" : colors.text,
            fontSize: 14,
          }}
        >
          {item.text}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>
          AI Symptom Diagnosis
        </Text>

        <View style={{ width: 24 }} />
      </View>

      {/* Chat Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.chatContainer}
        showsVerticalScrollIndicator={false}
      />

      {/* Input Section */}
      {!diagnosisComplete && (
        <View
          style={[
            styles.inputContainer,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.card,
            },
          ]}
        >
          <TextInput
            placeholder="Type your answer..."
            placeholderTextColor={colors.sub}
            value={input}
            onChangeText={setInput}
            style={[styles.input, { color: colors.text }]}
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: colors.accent },
            ]}
            onPress={handleSend}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  header: {
    paddingTop: 55,
    paddingBottom: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },

  chatContainer: {
    padding: 16,
    paddingBottom: 80,
  },

  messageBubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },

  inputContainer: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: 1,
    alignItems: "center",
  },

  input: {
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 12,
  },

  sendButton: {
    marginLeft: 8,
    padding: 10,
    borderRadius: 10,
  },
});