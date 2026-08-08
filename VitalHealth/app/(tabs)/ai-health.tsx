// app/(tabs)/ai-health.tsx
// Redesigned AI Health Page — High Precision Digital Twin Clinical Assistant & RAG Interface

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  PermissionsAndroid,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../../context/ThemeContext";
import { colors } from "../../theme/colors";
import { useMedicine } from "../../context/MedicineContext";
import { useSymptoms } from "../../context/SymptomContext";
import { useFamily } from "../../context/FamilyContext";
import { useProfile } from "../../context/ProfileContext";
import { useCognitive } from "../../context/CognitiveContext";
import { useBiogearsTwin } from "../../context/BiogearsTwinContext";
import { useSteps } from "../../context/StepContext";
import { useHydration } from "../../context/HydrationContext";

// On-Device RAG & Vector Storage Services
import {
  EmbeddedChunk,
  loadChunks,
  loadDocuments,
  pickDocument,
  pickImage,
  processDocument,
  ProcessingProgress,
  saveChunks,
  saveDocuments,
} from "../../services/documentProcessing";
import {
  generateEmbedding,
  retrieveTopKChunks,
} from "../../services/embeddingService";
import { getApiKey } from "../../services/biogears";
import { getCentralAiBaseUrl } from "../../constants/Config";

// ── Voice Recognition Setup ───────────────────────────────────────────────────
let Voice: any = null;
try {
  Voice = require("@react-native-voice/voice").default;
} catch {
  // Graceful fallback for non-native platforms
}

// ── Constants ────────────────────────────────────────────────────────────────
const KEY_CHAT_HISTORY = "@hai_chat_history";
const TOP_K = 5;
const MAX_SAVED_SESSIONS = 30;

const getAiBaseUrl = async (): Promise<string> => {
  return await getCentralAiBaseUrl();
};

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtRelativeDate = (ts: number): string => {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
};

// ── Types ────────────────────────────────────────────────────────────────────
type EvidenceBundleMeta = {
  intent?: string;
  overall_confidence?: number;
  sources_reviewed?: { name: string; status: string; records: number }[];
  missing_data?: string[];
  conflicts_detected?: number;
};

type Message = {
  id: string;
  text: string;
  sender: "user" | "ai" | "system";
  timestamp: Date;
  evidenceBundle?: EvidenceBundleMeta;
  followups?: string[];
};

type Doc = {
  id: string;
  name: string;
  type: "pdf" | "image";
  chunkCount: number;
  uploadedAt: number;
};

type SerializedMessage = {
  id: string;
  text: string;
  sender: "user" | "ai" | "system";
  timestamp: number;
  evidenceBundle?: EvidenceBundleMeta;
  followups?: string[];
};

type ChatSession = {
  id: string;
  title: string;
  preview: string;
  startedAt: number;
  updatedAt: number;
  messages: SerializedMessage[];
};

// ── Chat History Store ───────────────────────────────────────────────────────
const loadChatHistory = async (userId: string = "self"): Promise<ChatSession[]> => {
  try {
    const key = `${KEY_CHAT_HISTORY}_${userId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  } catch {
    return [];
  }
};

const saveChatHistory = async (userId: string = "self", sessions: ChatSession[]) => {
  try {
    const key = `${KEY_CHAT_HISTORY}_${userId}`;
    const trimmed = [...sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SAVED_SESSIONS);
    await AsyncStorage.setItem(key, JSON.stringify(trimmed));
  } catch {}
};

const serializeMessages = (msgs: Message[]): SerializedMessage[] =>
  msgs.map((m) => ({ ...m, timestamp: m.timestamp.getTime() }));

const deserializeMessages = (msgs: SerializedMessage[]): Message[] =>
  msgs.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));

const buildSessionTitle = (messages: Message[]) =>
  messages.find((m) => m.sender === "user")?.text.slice(0, 45) ?? "Health Conversation";

const buildSessionPreview = (messages: Message[]) => {
  const last = [...messages].reverse().find((m) => m.sender === "ai");
  return last ? last.text.replace(/\*\*/g, "").slice(0, 75) + "…" : "";
};

// ── Digital Twin Context Inspector Sheet ─────────────────────────────────────
function TwinContextSheet({
  visible,
  onClose,
  c,
  patientCtx,
}: {
  visible: boolean;
  onClose: () => void;
  c: any;
  patientCtx: any;
}) {
  if (!visible) return null;
  const sysBp = patientCtx?.body_measurements?.blood_pressure || "120/80 mmHg";
  const hr = patientCtx?.body_measurements?.resting_hr || 72;
  const symptomsCount = patientCtx?.activeSymptoms?.length || 0;
  const medsCount = patientCtx?.medicines?.length || 0;
  const waterMl = patientCtx?.hydration?.water_intake_ml || 0;
  const stepsVal = patientCtx?.fitness_activity?.steps || 0;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>

        <View style={[styles.sheetContainer, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[styles.sheetIconWrap, { backgroundColor: `${c.accent}15` }]}>
                <Ionicons name="pulse" size={20} color={c.accent} />
              </View>
              <View>
                <Text style={[styles.sheetTitle, { color: c.text }]}>Digital Twin Active Context</Text>
                <Text style={[styles.sheetSub, { color: c.sub }]}>Real-time patient stream bound to AI reasoning</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: `${c.sub}15` }]}>
              <Ionicons name="close" size={18} color={c.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380, marginTop: 14 }}>
            <View style={{ gap: 10 }}>
              {/* Profile Card */}
              <View style={[styles.contextMetricCard, { backgroundColor: c.bg, borderColor: c.border }]}>
                <Ionicons name="person-circle-outline" size={18} color={c.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contextMetricTitle, { color: c.sub }]}>Patient Profile</Text>
                  <Text style={[styles.contextMetricVal, { color: c.text }]}>
                    {patientCtx.patient_name} • {patientCtx.age} yrs • {patientCtx.gender} ({patientCtx.body_measurements.blood_type})
                  </Text>
                </View>
              </View>

              {/* Vitals Grid */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={[styles.contextMetricCard, { flex: 1, backgroundColor: c.bg, borderColor: c.border }]}>
                  <Ionicons name="heart-outline" size={18} color="#ef4444" />
                  <View>
                    <Text style={[styles.contextMetricTitle, { color: c.sub }]}>Resting HR</Text>
                    <Text style={[styles.contextMetricVal, { color: c.text }]}>{hr} bpm</Text>
                  </View>
                </View>
                <View style={[styles.contextMetricCard, { flex: 1, backgroundColor: c.bg, borderColor: c.border }]}>
                  <Ionicons name="speedometer-outline" size={18} color="#3b82f6" />
                  <View>
                    <Text style={[styles.contextMetricTitle, { color: c.sub }]}>Blood Pressure</Text>
                    <Text style={[styles.contextMetricVal, { color: c.text }]}>{sysBp}</Text>
                  </View>
                </View>
              </View>

              {/* Symptoms & Meds Grid */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={[styles.contextMetricCard, { flex: 1, backgroundColor: c.bg, borderColor: c.border }]}>
                  <Ionicons name="bandage-outline" size={18} color="#f59e0b" />
                  <View>
                    <Text style={[styles.contextMetricTitle, { color: c.sub }]}>Active Symptoms</Text>
                    <Text style={[styles.contextMetricVal, { color: c.text }]}>
                      {symptomsCount === 0 ? "None Logged" : `${symptomsCount} active`}
                    </Text>
                  </View>
                </View>
                <View style={[styles.contextMetricCard, { flex: 1, backgroundColor: c.bg, borderColor: c.border }]}>
                  <Ionicons name="medkit-outline" size={18} color="#10b981" />
                  <View>
                    <Text style={[styles.contextMetricTitle, { color: c.sub }]}>Medications</Text>
                    <Text style={[styles.contextMetricVal, { color: c.text }]}>
                      {medsCount === 0 ? "No active meds" : `${medsCount} active`}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Activity & Hydration */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={[styles.contextMetricCard, { flex: 1, backgroundColor: c.bg, borderColor: c.border }]}>
                  <Ionicons name="walk-outline" size={18} color="#8b5cf6" />
                  <View>
                    <Text style={[styles.contextMetricTitle, { color: c.sub }]}>Daily Steps</Text>
                    <Text style={[styles.contextMetricVal, { color: c.text }]}>{stepsVal.toLocaleString()} steps</Text>
                  </View>
                </View>
                <View style={[styles.contextMetricCard, { flex: 1, backgroundColor: c.bg, borderColor: c.border }]}>
                  <Ionicons name="water-outline" size={18} color="#0284c7" />
                  <View>
                    <Text style={[styles.contextMetricTitle, { color: c.sub }]}>Hydration</Text>
                    <Text style={[styles.contextMetricVal, { color: c.text }]}>{waterMl} / 2,500 mL</Text>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Attachment & Document Options Bottom Sheet ───────────────────────────────
function UploadOptionsModal({
  visible,
  onClose,
  onPickPdf,
  onPickImage,
  onViewChunks,
  c,
  chunkCount,
}: {
  visible: boolean;
  onClose: () => void;
  onPickPdf: () => void;
  onPickImage: () => void;
  onViewChunks: () => void;
  c: any;
  chunkCount: number;
}) {
  if (!visible) return null;
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>

        <View style={[styles.sheetContainer, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeaderRow}>
            <View>
              <Text style={[styles.sheetTitle, { color: c.text }]}>Add Document Context</Text>
              <Text style={[styles.sheetSub, { color: c.sub }]}>Processed locally on-device with zero cloud exposure</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: `${c.sub}15` }]}>
              <Ionicons name="close" size={18} color={c.sub} />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 10, marginTop: 16 }}>
            <TouchableOpacity
              style={[styles.uploadOptionBtn, { backgroundColor: c.bg, borderColor: c.border }]}
              onPress={() => {
                onClose();
                onPickPdf();
              }}
            >
              <View style={[styles.uploadOptionIcon, { backgroundColor: "#3b82f618" }]}>
                <Ionicons name="document-text" size={20} color="#3b82f6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.uploadOptionTitle, { color: c.text }]}>Upload PDF Lab Report</Text>
                <Text style={[styles.uploadOptionSub, { color: c.sub }]}>Extract clinical data & biomarkers</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.sub} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.uploadOptionBtn, { backgroundColor: c.bg, borderColor: c.border }]}
              onPress={() => {
                onClose();
                onPickImage();
              }}
            >
              <View style={[styles.uploadOptionIcon, { backgroundColor: "#10b98118" }]}>
                <Ionicons name="camera" size={20} color="#10b981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.uploadOptionTitle, { color: c.text }]}>Scan Prescription Photo</Text>
                <Text style={[styles.uploadOptionSub, { color: c.sub }]}>OCR text extraction from physical notes</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.sub} />
            </TouchableOpacity>

            {chunkCount > 0 && (
              <TouchableOpacity
                style={[styles.uploadOptionBtn, { backgroundColor: c.bg, borderColor: c.border }]}
                onPress={() => {
                  onClose();
                  onViewChunks();
                }}
              >
                <View style={[styles.uploadOptionIcon, { backgroundColor: "#8b5cf618" }]}>
                  <Ionicons name="layers" size={20} color="#8b5cf6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.uploadOptionTitle, { color: c.text }]}>View On-Device Embeddings</Text>
                  <Text style={[styles.uploadOptionSub, { color: c.sub }]}>{chunkCount} vector chunks stored locally</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.sub} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Single Document Inspector Modal ───────────────────────────────────────────
function DocViewerModal({
  doc,
  chunks,
  onClose,
  c,
}: {
  doc: Doc | null;
  chunks: EmbeddedChunk[];
  onClose: () => void;
  c: any;
}) {
  if (!doc) return null;
  const docChunks = chunks.filter((ch) => ch.metadata?.docId === doc.id);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={[styles.docHeader, { backgroundColor: c.card, borderBottomColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docHeaderTitle, { color: c.text }]} numberOfLines={1}>
              {doc.name}
            </Text>
            <Text style={[styles.docHeaderSub, { color: c.sub }]}>
              {doc.type.toUpperCase()} · {docChunks.length} chunks · {fmtDate(doc.uploadedAt)}
            </Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={c.danger} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
          <Text style={[styles.sectionHead, { marginTop: 14, marginBottom: 10, color: c.text }]}>
            📄 On-Device Vector Embeddings
          </Text>
          {docChunks.length === 0 ? (
            <Text style={[styles.emptyTxt, { color: c.sub }]}>No text extracted.</Text>
          ) : (
            docChunks.map((ch, i) => (
              <View key={i} style={[styles.chunkCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.chunkIdx, { color: c.accent }]}>Chunk #{i + 1}</Text>
                <Text style={[styles.chunkTxt, { color: c.text }]}>{ch.text}</Text>
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── All Embeddings Knowledge Base Modal ──────────────────────────────────────
function AllChunksModal({
  chunks,
  docs,
  visible,
  onClose,
  c,
}: {
  chunks: EmbeddedChunk[];
  docs: Doc[];
  visible: boolean;
  onClose: () => void;
  c: any;
}) {
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={[styles.docHeader, { backgroundColor: c.card, borderBottomColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docHeaderTitle, { color: c.text }]}>🧠 Clinical Knowledge Base</Text>
            <Text style={[styles.docHeaderSub, { color: c.sub }]}>
              {chunks.length} chunks indexed across {docs.length} document(s)
            </Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={c.danger} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
          {chunks.length === 0 ? (
            <View style={{ alignItems: "center", marginTop: 60 }}>
              <Ionicons name="document-text-outline" size={48} color={c.sub} />
              <Text style={[styles.emptyTxt, { color: c.sub, fontSize: 16, marginTop: 12 }]}>
                No clinical documents uploaded yet
              </Text>
            </View>
          ) : (
            docs.map((doc) => {
              const docChunks = chunks.filter((ch) => ch.metadata?.docId === doc.id);
              return (
                <View key={doc.id} style={{ marginBottom: 18, marginTop: 14 }}>
                  <View style={[styles.docSectionHeader, { backgroundColor: c.card, borderColor: c.border }]}>
                    <Ionicons name="document-attach" size={16} color={c.accent} />
                    <Text style={[styles.docSectionTitle, { color: c.text }]} numberOfLines={1}>
                      {doc.name}
                    </Text>
                    <Text style={[styles.docSectionSub, { color: c.sub }]}>{docChunks.length} chunks</Text>
                  </View>
                  {docChunks.map((ch, i) => (
                    <View key={ch.id} style={[styles.chunkCard, { backgroundColor: c.bg, borderColor: c.border }]}>
                      <Text style={[styles.chunkIdx, { color: c.accent }]}>Chunk #{i + 1}</Text>
                      <Text style={[styles.chunkTxt, { color: c.sub }]}>{ch.text}</Text>
                    </View>
                  ))}
                </View>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── On-Device Processing Overlay Modal ────────────────────────────────────────
function ProcessingModal({
  visible,
  progress,
  onCancel,
  c,
}: {
  visible: boolean;
  progress: ProcessingProgress | null;
  onCancel: () => void;
  c: any;
}) {
  if (!visible || !progress) return null;
  const color = progress.stage === "complete" ? "#10b981" : progress.stage === "error" ? c.danger : c.accent;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.processingOverlay}>
        <View style={[styles.processingCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={[styles.processingTitle, { color: c.text }]}>Processing Document</Text>
          <Text style={[styles.processingMessage, { color: c.sub }]}>{progress.message}</Text>
          {progress.stage !== "complete" && progress.stage !== "error" && (
            <View style={[styles.progressBarContainer, { backgroundColor: c.border }]}>
              <View style={[styles.progressBar, { width: `${progress.progress}%`, backgroundColor: color }]} />
            </View>
          )}
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={[styles.cancelBtnTxt, { color: c.danger }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Chat History Drawer ──────────────────────────────────────────────────────
function ChatHistoryDrawer({
  visible,
  sessions,
  onClose,
  onSelectSession,
  onDeleteSession,
  onNewChat,
  c,
  headerH,
}: {
  visible: boolean;
  sessions: ChatSession[];
  onClose: () => void;
  onSelectSession: (s: ChatSession) => void;
  onDeleteSession: (id: string) => void;
  onNewChat: () => void;
  c: any;
  headerH: number;
}) {
  const slideAnim = useRef(new Animated.Value(-340)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
        Animated.timing(overlayAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -340, duration: 250, useNativeDriver: true }),
        Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted) return null;

  const dateMap: Record<string, ChatSession[]> = {};
  sessions.forEach((s) => {
    const label = fmtRelativeDate(s.updatedAt);
    if (!dateMap[label]) dateMap[label] = [];
    dateMap[label].push(s);
  });
  const grouped = [
    ...["Today", "Yesterday"].filter((k) => dateMap[k]).map((k) => ({ label: k, data: dateMap[k] })),
    ...Object.keys(dateMap)
      .filter((k) => !["Today", "Yesterday"].includes(k))
      .map((k) => ({ label: k, data: dateMap[k] })),
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayAnim }]}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1, backgroundColor: "#00000066" }} />
        </TouchableWithoutFeedback>
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: c.card,
            borderRightColor: c.border,
            transform: [{ translateX: slideAnim }],
            paddingTop: headerH,
          },
        ]}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={[styles.drawerHeader, { borderBottomColor: c.border }]}>
            <View>
              <Text style={[styles.drawerTitle, { color: c.text }]}>💬 Chat History</Text>
              <Text style={[styles.drawerSub, { color: c.sub }]}>{sessions.length} saved conversations</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
              <Ionicons name="close" size={20} color={c.sub} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.newChatBtn, { backgroundColor: c.accent }]}
            onPress={() => {
              onNewChat();
              onClose();
            }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newChatTxt}>New Health Chat</Text>
          </TouchableOpacity>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {sessions.length === 0 ? (
              <View style={styles.drawerEmpty}>
                <Ionicons name="chatbubbles-outline" size={36} color={c.sub} />
                <Text style={[styles.drawerEmptyTxt, { color: c.sub, marginTop: 10 }]}>
                  No past conversations yet.
                </Text>
              </View>
            ) : (
              grouped.map(({ label, data }) => (
                <View key={label}>
                  <Text style={[styles.drawerGroupLabel, { color: c.sub }]}>{label}</Text>
                  {data.map((session) => (
                    <TouchableOpacity
                      key={session.id}
                      style={[styles.sessionItem, { borderBottomColor: c.border }]}
                      onPress={() => {
                        onSelectSession(session);
                        onClose();
                      }}
                      onLongPress={() =>
                        Alert.alert("Delete Chat", `Delete "${session.title}"?`, [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => onDeleteSession(session.id),
                          },
                        ])
                      }
                    >
                      <View style={[styles.sessionIconWrap, { backgroundColor: c.bg }]}>
                        <Ionicons name="chatbox-outline" size={16} color={c.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sessionTitle, { color: c.text }]} numberOfLines={1}>
                          {session.title}
                        </Text>
                        <Text style={[styles.sessionPreview, { color: c.sub }]} numberOfLines={1}>
                          {session.preview || "Tap to resume conversation..."}
                        </Text>
                        <Text style={[styles.sessionTime, { color: c.sub }]}>{fmtDate(session.updatedAt)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ))
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

// ── Voice Waveform Indicator Bar ──────────────────────────────────────────────
function VoiceIndicator({ visible, partialText }: { visible: boolean; partialText: string }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.voiceIndicatorWrap}>
      <View style={styles.voiceIndicatorRow}>
        <Animated.View style={[styles.voiceDot, { transform: [{ scale: pulseAnim }] }]} />
        <Text style={styles.voiceIndicatorTxt}>Listening for speech… tap mic to stop</Text>
      </View>
      {!!partialText && (
        <Text style={styles.voicePartialTxt} numberOfLines={2}>
          "{partialText}"
        </Text>
      )}
    </View>
  );
}

// ── Hybrid Live Clinical Reasoning Typing Indicator ─────────────────────────
function TypingIndicatorBubble({ c }: { c: any }) {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;
  const [statusIdx, setStatusIdx] = useState(0);

  const STAGES = [
    "🫀 Ingesting physiological vitals...",
    "🔍 Searching clinical knowledge base...",
    "✨ Synthesizing personalized answer...",
    "📊 Evaluating health risk baselines...",
  ];

  useEffect(() => {
    const animateDot = (anim: Animated.Value, delay: number) => {
      return Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1,
              duration: 350,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.3,
              duration: 350,
              useNativeDriver: true,
            }),
          ])
        ),
      ]);
    };

    const a1 = animateDot(dot1, 0);
    const a2 = animateDot(dot2, 120);
    const a3 = animateDot(dot3, 240);

    a1.start();
    a2.start();
    a3.start();

    const interval = setInterval(() => {
      setStatusIdx((prev) => (prev + 1) % STAGES.length);
    }, 1100);

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
      clearInterval(interval);
    };
  }, []);

  return (
    <View style={styles.typingRow}>
      <View style={[styles.avatar, { backgroundColor: `${c.accent}15`, borderColor: c.accent }]}>
        <Ionicons name="sparkles" size={14} color={c.accent} />
      </View>

      <View style={[styles.typingCard, { backgroundColor: c.card, borderColor: c.border }]}>
        {/* Animated 3-Dots Wave */}
        <View style={styles.dotsRow}>
          <Animated.View
            style={[
              styles.dot,
              {
                backgroundColor: c.accent,
                opacity: dot1,
                transform: [{ scale: dot1 }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              {
                backgroundColor: c.accent,
                opacity: dot2,
                transform: [{ scale: dot2 }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              {
                backgroundColor: c.accent,
                opacity: dot3,
                transform: [{ scale: dot3 }],
              },
            ]}
          />
        </View>

        {/* Dynamic Micro-Status Tag */}
        <Text style={[styles.typingStatusText, { color: c.sub }]}>
          {STAGES[statusIdx]}
        </Text>
      </View>
    </View>
  );
}

// ── Rich Text Parser ─────────────────────────────────────────────────────────
function parseInlineContent(text: string, style?: any) {
  const parts: { text: string; bold?: boolean; italic?: boolean }[] = [];
  const mdRegex = /\*\*(.+?)\*\*|\*(.+?)\*/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mdRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      parts.push({ text: match[1], bold: true });
    } else if (match[2] !== undefined) {
      parts.push({ text: match[2], italic: true });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex) });
  }

  const autoBoldRegex =
    /\b(?:Warning|Danger|High Risk|Alert|Normal|Elevated|Critical|Low|High|Optimal|Caution|Anomalies|Anomaly|Safe|Unsafe|Risk)\b|\b\d+(?:\.\d+)?(?:[/-]\d+(?:\.\d+)?)?(?:\s*(?:%|bpm|mg\/dL|kg|cm|mmHg|breaths\/min|seconds|hours|minutes|mmol\/L|mL|g|h|min|s|bpm))?\b/gi;

  const finalElements: React.ReactNode[] = [];
  parts.forEach((part, partIdx) => {
    if (part.bold) {
      finalElements.push(
        <Text key={`b-${partIdx}`} style={[style, { fontWeight: "800" }]}>
          {part.text}
        </Text>
      );
    } else if (part.italic) {
      finalElements.push(
        <Text key={`i-${partIdx}`} style={[style, { fontStyle: "italic" }]}>
          {part.text}
        </Text>
      );
    } else {
      let plainText = part.text;
      let lastPlainIndex = 0;
      let plainMatch: RegExpExecArray | null;
      let subIdx = 0;

      autoBoldRegex.lastIndex = 0;

      while ((plainMatch = autoBoldRegex.exec(plainText)) !== null) {
        if (plainMatch.index > lastPlainIndex) {
          finalElements.push(
            <Text key={`p-${partIdx}-${subIdx++}`} style={style}>
              {plainText.slice(lastPlainIndex, plainMatch.index)}
            </Text>
          );
        }
        finalElements.push(
          <Text key={`ab-${partIdx}-${subIdx++}`} style={[style, { fontWeight: "700" }]}>
            {plainMatch[0]}
          </Text>
        );
        lastPlainIndex = plainMatch.index + plainMatch[0].length;
      }
      if (lastPlainIndex < plainText.length) {
        finalElements.push(
          <Text key={`p-${partIdx}-${subIdx++}`} style={style}>
            {plainText.slice(lastPlainIndex)}
          </Text>
        );
      }
    }
  });

  return <Text style={style}>{finalElements}</Text>;
}

function RichText({ text, style }: { text: string; style?: any }) {
  if (!text) return null;

  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      blocks.push(<View key={`sp-${lineIdx}`} style={{ height: 4 }} />);
      return;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      const headerText = trimmed.replace(/^#{1,6}\s+/, "");
      blocks.push(
        <Text
          key={`h-${lineIdx}`}
          style={[
            style,
            {
              fontSize: 15,
              fontWeight: "800",
              marginTop: 8,
              marginBottom: 4,
              letterSpacing: -0.2,
            },
          ]}
        >
          {headerText}
        </Text>
      );
      return;
    }

    if (/^(?:[•\-\*]|\d+\.)\s+/.test(trimmed)) {
      const bulletText = trimmed.replace(/^(?:[•\-\*]|\d+\.)\s+/, "");
      const accentColor = style?.color || "#3b82f6";
      blocks.push(
        <View
          key={`b-${lineIdx}`}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            marginVertical: 2.5,
            paddingLeft: 2,
          }}
        >
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: accentColor,
              marginTop: 8,
              marginRight: 8,
              opacity: 0.8,
            }}
          />
          <View style={{ flex: 1 }}>{parseInlineContent(bulletText, style)}</View>
        </View>
      );
      return;
    }

    if (trimmed.startsWith(">")) {
      const quoteText = trimmed.replace(/^>\s*/, "");
      blocks.push(
        <View
          key={`q-${lineIdx}`}
          style={{
            backgroundColor: "rgba(59, 130, 246, 0.08)",
            borderLeftWidth: 3,
            borderLeftColor: "#3b82f6",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 6,
            marginVertical: 6,
          }}
        >
          {parseInlineContent(quoteText, [style, { fontSize: 13, fontStyle: "italic" }])}
        </View>
      );
      return;
    }

    blocks.push(
      <View key={`p-${lineIdx}`} style={{ marginVertical: 1.5 }}>
        {parseInlineContent(trimmed, style)}
      </View>
    );
  });

  return <View>{blocks}</View>;
}

// ── Evidence Bundle Transparency Card ─────────────────────────────────────────
function EvidenceCard({ bundle, c, theme }: { bundle: EvidenceBundleMeta; c: any; theme: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!bundle) return null;

  const confidencePct = bundle.overall_confidence !== undefined ? Math.round(bundle.overall_confidence * 100) : null;
  const isHighConf = (bundle.overall_confidence ?? 1.0) >= 0.8;
  const badgeColor = isHighConf ? "#10b981" : "#f59e0b";
  const badgeBg = isHighConf ? "#10b98118" : "#f59e0b18";

  return (
    <View
      style={{
        backgroundColor: theme === "dark" ? "#0f172a" : "#f8fafc",
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
        style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="shield-checkmark" size={14} color="#10b981" />
          <Text style={{ fontSize: 11, fontWeight: "700", color: c.text }}>Clinical Evidence Audit</Text>
          {confidencePct !== null && (
            <View style={{ backgroundColor: badgeBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: badgeColor }}>{confidencePct}% Confidence</Text>
            </View>
          )}
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={c.sub} />
      </TouchableOpacity>

      {expanded && (
        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border }}>
          {bundle.intent && (
            <Text style={{ fontSize: 10, fontWeight: "600", color: c.sub, marginBottom: 4 }}>
              INTENT CLASSIFICATION: {bundle.intent.toUpperCase()}
            </Text>
          )}
          {bundle.sources_reviewed && bundle.sources_reviewed.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {bundle.sources_reviewed.map((src, sIdx) => (
                <View
                  key={sIdx}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 3,
                    backgroundColor: src.status === "available" ? "#10b98115" : "#ef444415",
                    paddingHorizontal: 6,
                    paddingVertical: 3,
                    borderRadius: 6,
                  }}
                >
                  <Ionicons
                    name={src.status === "available" ? "checkmark-circle" : "alert-circle"}
                    size={10}
                    color={src.status === "available" ? "#10b981" : "#ef4444"}
                  />
                  <Text
                    style={{
                      fontSize: 10,
                      color: src.status === "available" ? "#10b981" : "#ef4444",
                      fontWeight: "600",
                    }}
                  >
                    {src.name}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Smart Quick Suggestions Helper ────────────────────────────────────────────
const getQuickSuggestions = (text: string): string[] => {
  const t = text.toLowerCase();
  const chips: string[] = [];
  if (t.includes("hba1c") || t.includes("glucose") || t.includes("blood sugar")) {
    chips.push("What is my HbA1c target?", "How does diet affect glucose?");
  }
  if (t.includes("bp") || t.includes("blood pressure") || t.includes("hypertension")) {
    chips.push("Normal blood pressure range?", "How to reduce hypertension?");
  }
  if (t.includes("medication") || t.includes("metformin") || t.includes("dose")) {
    chips.push("Common side effects?", "Best time to take medication?");
  }
  if (t.includes("water") || t.includes("hydrat")) {
    chips.push("Daily hydration goals?", "Signs of dehydration?");
  }
  if (t.includes("symptom") || t.includes("pain")) {
    chips.push("When to consult a doctor?", "What home measures help?");
  }
  if (chips.length === 0) {
    chips.push("Explain potential causes", "Recommended next steps?", "Should I alert my doctor?");
  }
  return chips.slice(0, 3);
};

// ── Categorized Health Prompt Cards Data ──────────────────────────────────────
const PROMPT_CATEGORIES = [
  {
    id: "cardio",
    title: "Cardio & Vitals",
    desc: "Heart rate & blood pressure analysis",
    icon: "heart-outline" as const,
    color: "#ef4444",
    query: "How are my blood pressure and resting heart rate metrics trending?",
  },
  {
    id: "symptoms",
    title: "Symptom Check",
    desc: "Evaluate active symptoms & risks",
    icon: "bandage-outline" as const,
    color: "#f59e0b",
    query: "Analyze my active symptoms and highlight any potential medical risks.",
  },
  {
    id: "meds",
    title: "Medication Audit",
    desc: "Check interactions & dose timing",
    icon: "medkit-outline" as const,
    color: "#10b981",
    query: "Review my current active medications for potential interactions or guidelines.",
  },
  {
    id: "labs",
    title: "Lab Breakdown",
    desc: "Interpret blood work & lab reports",
    icon: "flask-outline" as const,
    color: "#8b5cf6",
    query: "Explain how to read my lab results and key biomarker baseline ranges.",
  },
  {
    id: "wellness",
    title: "Hydration & Energy",
    desc: "Assess daily water & stamina",
    icon: "water-outline" as const,
    color: "#0284c7",
    query: "Evaluate my daily hydration and activity metrics for optimal energy.",
  },
];

// ── Main Screen Component ─────────────────────────────────────────────────────
export default function AIHealthScreen() {
  const { symptom } = useLocalSearchParams<{ symptom?: string; source?: string }>();
  const { theme } = useTheme();
  const c = colors[theme];
  const { medicines } = useMedicine();
  const { activeSymptoms, historySymptoms } = useSymptoms();
  const { activeProfile, activeMemberId, isSwitched } = useFamily();
  const { profile, ageYears } = useProfile();
  const { sessions: cogSessions, cognitiveAge, currentStreak: cogStreak, getDomainTrends } = useCognitive();
  const { lastVitals, organScores } = useBiogearsTwin();
  const { steps, calories, distanceKm } = useSteps();
  const { water: waterIntake } = useHydration();
  const currentUserId = activeMemberId || activeProfile?.uid || "self";
  const insets = useSafeAreaInsets();
  const headerH = 56 + insets.top;

  const [connected, setConnected] = useState(false);
  const router = useRouter();
  const [modelLoading, setModelLoading] = useState(false);

  // Documents & Vectors
  const [docs, setDocs] = useState<Doc[]>([]);
  const [allChunks, setAllChunks] = useState<EmbeddedChunk[]>([]);
  const [viewDoc, setViewDoc] = useState<Doc | null>(null);
  const [showAllChunks, setShowAllChunks] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [showTwinContext, setShowTwinContext] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);

  // Chat Sessions & Drawer
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string>(genId());

  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const [partialVoiceText, setPartialVoiceText] = useState("");

  // Chat State
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", text: "__welcome__", sender: "ai", timestamp: new Date() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoSent, setAutoSent] = useState(false);

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const historyRef = useRef<string[]>([]);

  // Voice Event Listeners
  useEffect(() => {
    if (!Voice) return;

    Voice.onSpeechStart = () => {
      setIsRecording(true);
      setPartialVoiceText("");
    };

    Voice.onSpeechRecognized = () => {
      setIsRecording(true);
    };

    Voice.onSpeechEnd = () => {
      setIsRecording(false);
    };

    Voice.onSpeechError = (e: any) => {
      setIsRecording(false);
      setPartialVoiceText("");
      const code = e?.error?.code?.toString() || e?.code?.toString() || "";
      const errorMsg = e?.error?.message || e?.message || "";
      // Error code 7 is no match / network timeout on Android SpeechRecognizer
      if (code === "7" || errorMsg.includes("7/No match")) {
        console.log("Voice recognizer idle/no match");
      } else if (code) {
        Alert.alert("Voice Assistant", errorMsg || "Could not recognize speech. Please try speaking again.");
      }
    };

    Voice.onSpeechPartialResults = (e: any) => {
      const partial = e?.value?.[0] || "";
      setPartialVoiceText(partial);
      if (partial.trim()) {
        setInput(partial);
      }
    };

    Voice.onSpeechResults = (e: any) => {
      const result = e?.value?.[0] || "";
      setPartialVoiceText("");
      setIsRecording(false);
      if (result.trim()) {
        setInput(result.trim());
      }
    };

    return () => {
      Voice.destroy()
        .then(() => {
          Voice.removeAllListeners();
        })
        .catch(() => {});
    };
  }, []);

  const requestMicPermission = async (): Promise<boolean> => {
    if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
          title: "Microphone Permission",
          message: "VitalHealth AI requires microphone access to listen to your health questions.",
          buttonPositive: "Allow",
          buttonNegative: "Deny",
        });
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch {
        return false;
      }
    }
    return true;
  };

  const handleVoice = async () => {
    if (!Voice) {
      Alert.alert(
        "Voice Input Unavailable",
        "Voice-to-text requires speech service support on your physical mobile device."
      );
      return;
    }

    if (isRecording) {
      try {
        await Voice.stop();
      } catch {}
      setIsRecording(false);
      setPartialVoiceText("");
      return;
    }

    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      Alert.alert("Permission Denied", "Microphone access is required for voice input. Please enable microphone permissions in App Settings.");
      return;
    }

    setPartialVoiceText("");
    try {
      await Voice.stop().catch(() => {});
      await Voice.start("en-US");
      setIsRecording(true);
    } catch (e: any) {
      setIsRecording(false);
      Alert.alert("Voice Engine Error", e?.message || "Could not start voice recognition.");
    }
  };

  // Fetch AI Greeting
  const fetchGreeting = async () => {
    const profileName = activeProfile?.firstName || "";
    const greetingName = profileName ? ` ${profileName}` : "";
    try {
      const baseUrl = await getAiBaseUrl();
      const res = await fetch(`${baseUrl}/greeting?user_id=${currentUserId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const text =
        data.message ||
        `Good day${greetingName}. I am your **Personal Digital Twin Assistant**.\n\nAsk me about your symptoms, physiological vitals, or clinical reports — I will provide evidence-based insights.`;
      setMessages([{ id: "welcome", text, sender: "ai", timestamp: new Date() }]);
    } catch {
      setMessages([
        {
          id: "welcome",
          text: `Good day${greetingName}. I am your **Personal Digital Twin Assistant**.\n\nAsk me about your symptoms, physiological vitals, or clinical reports — I will provide evidence-based insights.`,
          sender: "ai",
          timestamp: new Date(),
        },
      ]);
    }
  };

  // Mount: Load vectors & warmup embeddings
  useEffect(() => {
    (async () => {
      try {
        const d = await loadDocuments();
        const ch = await loadChunks();
        setDocs(d);
        setAllChunks(ch);
        setModelLoading(true);
        generateEmbedding("warmup").finally(() => setModelLoading(false));
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // Sync Chat History per profile
  const loadedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    loadedUserIdRef.current = null;
    (async () => {
      try {
        const history = await loadChatHistory(currentUserId);
        if (!active) return;
        setChatSessions(history);
        if (history.length > 0) {
          const latest = history[0];
          setCurrentSessionId(latest.id);
          setMessages(deserializeMessages(latest.messages));
          const uAndA = latest.messages.filter((m) => m.sender !== "system");
          historyRef.current = uAndA.map((m) => m.text).slice(-10);
        } else {
          setCurrentSessionId(genId());
          historyRef.current = [];
          await fetchGreeting();
        }
        if (active) {
          loadedUserIdRef.current = currentUserId;
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentUserId]);

  // Focus: Auto-connect server
  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try {
          const baseUrl = await getAiBaseUrl();
          const r = await fetch(`${baseUrl}/health`);
          setConnected(r.ok);
          if (r.ok && messages.length <= 1) await fetchGreeting();
        } catch {
          setConnected(false);
          if (messages.length <= 1) await fetchGreeting();
        }
      })();
    }, [messages.length, currentUserId])
  );

  // Persist current session
  useEffect(() => {
    if (loadedUserIdRef.current !== currentUserId) return;
    if (!messages.some((m) => m.sender === "user")) return;
    const session: ChatSession = {
      id: currentSessionId,
      title: buildSessionTitle(messages),
      preview: buildSessionPreview(messages),
      startedAt: messages[0].timestamp.getTime(),
      updatedAt: Date.now(),
      messages: serializeMessages(messages),
    };
    setChatSessions((prev) => {
      const updated = [session, ...prev.filter((s) => s.id !== currentSessionId)];
      saveChatHistory(currentUserId, updated);
      return updated;
    });
  }, [messages, currentUserId, currentSessionId]);

  // Auto-send passed symptom deep-link
  useEffect(() => {
    if (!symptom || autoSent) return;
    const text = Array.isArray(symptom) ? symptom[0] : symptom;
    if (!text.trim()) return;
    const t = setTimeout(async () => {
      await doSend(text);
      setAutoSent(true);
    }, 800);
    return () => clearTimeout(t);
  }, [symptom]);

  useEffect(() => {
    if (messages.length > 1) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  // Reset / New Session
  const handleNewChat = async () => {
    setCurrentSessionId(genId());
    historyRef.current = [];
    await fetchGreeting();
  };

  const handleSelectSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(deserializeMessages(session.messages));
    const uAndA = session.messages.filter((m) => m.sender !== "system");
    historyRef.current = uAndA.map((m) => m.text).slice(-10);
  };

  const handleDeleteSession = async (id: string) => {
    const updated = chatSessions.filter((s) => s.id !== id);
    setChatSessions(updated);
    await saveChatHistory(currentUserId, updated);
    if (id === currentSessionId) handleNewChat();
  };

  // Build Patient Context Payload
  const getPatientContextPayload = () => {
    const profileName = activeProfile
      ? `${activeProfile.firstName || ""} ${activeProfile.lastName || ""}`.trim()
      : profile
      ? `${profile.firstName || ""} ${profile.lastName || ""}`.trim()
      : "Patient";
    const pAge = activeProfile?.dateOfBirth
      ? Math.floor((Date.now() - new Date(activeProfile.dateOfBirth).getTime()) / 31557600000)
      : ageYears || (profile as any)?.ageYears || 30;
    const pGender = activeProfile?.gender || profile?.gender || "not specified";
    const pHeight = activeProfile?.height || profile?.height || "170 cm";
    const pWeight = activeProfile?.weight || profile?.weight || "70 kg";
    const pBloodType =
      (activeProfile as any)?.bloodType ||
      (profile as any)?.bloodType ||
      activeProfile?.bloodGroup ||
      profile?.bloodGroup ||
      "O+";
    const pBmi =
      (profile as any)?.bmi ||
      (pWeight && pHeight
        ? (parseFloat(String(pWeight)) / Math.pow(parseFloat(String(pHeight)) / 100, 2)).toFixed(1)
        : "22.5");

    return {
      patient_name: profileName,
      isSwitched: isSwitched,
      age: pAge,
      gender: pGender,
      body_measurements: {
        height: pHeight,
        weight: pWeight,
        bmi: pBmi,
        blood_type: pBloodType,
        resting_hr: lastVitals?.heart_rate || activeProfile?.biogears_resting_hr || 72,
        blood_pressure: lastVitals
          ? `${(lastVitals as any).systolic_bp || 120}/${(lastVitals as any).diastolic_bp || 80} mmHg`
          : activeProfile?.biogears_systolic_bp
          ? `${activeProfile.biogears_systolic_bp}/${activeProfile.biogears_diastolic_bp || 80} mmHg`
          : "120/80 mmHg",
      },
      cognitive_assessment: {
        cognitive_age: cognitiveAge || pAge,
        overall_score: cogSessions?.[0]?.overallScore ?? (cogSessions?.length > 0 ? 82 : 80),
        domain_scores: cogSessions?.[0]?.domainScores || {
          attention: 80,
          memory: 85,
          processingSpeed: 78,
          executiveFunction: 84,
        },
        test_results: cogSessions?.[0]?.testResults || [],
        streak_days: cogStreak || 0,
        domain_trends: getDomainTrends ? getDomainTrends() : null,
      },
      simulation_vitals: lastVitals || null,
      vitals: lastVitals || null,
      organ_scores: organScores || null,
      fitness_activity: {
        steps: steps || 0,
        calories: calories || 0,
        distance_km: distanceKm || 0,
      },
      hydration: {
        water_intake_ml: waterIntake || 0,
        daily_goal_ml: 2500,
      },
      medicines: medicines || [],
      activeSymptoms: activeSymptoms || [],
      historySymptoms: historySymptoms || [],
      biogearsProfile: {
        resting_hr: activeProfile?.biogears_resting_hr,
        systolic_bp: activeProfile?.biogears_systolic_bp,
        diastolic_bp: activeProfile?.biogears_diastolic_bp,
        fitness_level: activeProfile?.biogears_fitness_level,
      },
    };
  };

  // Send Query Handler
  const doSend = async (query: string) => {
    if (!query.trim() || loading) return;

    setMessages((prev) => [...prev, { id: genId(), text: query, sender: "user", timestamp: new Date() }]);
    setLoading(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    const baseUrl = await getAiBaseUrl();
    const history = [...historyRef.current];
    const patientCtx = getPatientContextPayload();

    try {
      let topChunks: string[] = [];
      if (allChunks.length > 0) {
        const qEmb = await generateEmbedding(query);
        topChunks = retrieveTopKChunks(qEmb, allChunks, TOP_K).map((r) => r.chunk.text);
      }
      const apiKey = await getApiKey();

      let aiReply = "";
      let evidenceBundleData: EvidenceBundleMeta | undefined = undefined;

      try {
        const brainRes = await fetch(`${baseUrl}/api/v5/brain/query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "X-API-Key": apiKey } : {}),
          },
          body: JSON.stringify({
            patient_id: currentUserId,
            session_id: currentSessionId,
            query,
            active_symptoms: activeSymptoms || [],
            patient_context: patientCtx,
          }),
        });
        if (brainRes.ok) {
          const brainData = await brainRes.json();
          aiReply = brainData.response_text || brainData.response || brainData.reply || "";
          evidenceBundleData = brainData.metadata?.evidence_bundle;
        }
      } catch (err) {}

      if (!aiReply) {
        const genRes = await fetch(`${baseUrl}/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "X-API-Key": apiKey } : {}),
          },
          body: JSON.stringify({
            patient_id: currentUserId,
            query,
            chunks: topChunks,
            history,
            patient_context: patientCtx,
          }),
        });
        if (!genRes.ok) {
          const err = await genRes.json().catch(() => ({}));
          throw new Error(err.detail || `Generate failed: ${genRes.status}`);
        }
        const resData = await genRes.json();
        aiReply = resData.response_text || resData.response || resData.reply || "No response from server.";
        evidenceBundleData = resData.metadata?.evidence_bundle;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          text: aiReply,
          sender: "ai",
          timestamp: new Date(),
          evidenceBundle: evidenceBundleData,
        },
      ]);
      historyRef.current = [...history, query, aiReply].slice(-10);
      setConnected(true);
    } catch (e: any) {
      setConnected(false);
      setMessages((prev) => [
        ...prev,
        { id: genId(), text: `⚠️ ${e.message}`, sender: "system", timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    const q = input.trim();
    setInput("");
    await doSend(q);
  };

  // Upload Handlers
  const handleUpload = async (type: "pdf" | "image") => {
    setUploading(true);
    setProcessingProgress({ stage: "extracting", progress: 0, message: "Selecting document..." });
    try {
      const document = type === "image" ? await pickImage() : await pickDocument();
      if (!document) {
        setUploading(false);
        setProcessingProgress(null);
        return;
      }
      const { document: newDoc, chunks: newChunks } = await processDocument(document, {
        chunkSize: 500,
        chunkOverlap: 100,
        onProgress: setProcessingProgress,
      });
      const updatedDocs = [...docs, newDoc];
      const updatedChunks = [...allChunks, ...newChunks];
      setDocs(updatedDocs);
      setAllChunks(updatedChunks);
      await saveDocuments(updatedDocs);
      await saveChunks(updatedChunks);
      Alert.alert(
        "✅ Document Embedded",
        `"${newDoc.name}" processed on-device. ${newDoc.chunkCount} vector chunks indexed.`
      );
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to process document");
    } finally {
      setUploading(false);
      setProcessingProgress(null);
    }
  };

  // Render Item for Chat Message List
  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === "user";
    const isSystem = item.sender === "system";
    const isWelcome = item.id === "welcome" && !isUser;
    const patientCtx = getPatientContextPayload();

    if (isSystem) {
      return (
        <View style={styles.sysRow}>
          <View style={[styles.sysPill, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.sysTxt, { color: c.sub }]}>{item.text}</Text>
          </View>
        </View>
      );
    }

    // ── Hero Welcome Experience ──────────────────────────────────────────────
    if (isWelcome) {
      const displayText =
        item.text === "__welcome__"
          ? "Good day. I am your **Personal Digital Twin Assistant**.\n\nAsk me about your physiological vitals, active symptoms, or clinical reports — I will provide evidence-based insights tailored to your health model."
          : item.text;

      const symptomCount = activeSymptoms?.length || 0;
      const medCount = medicines?.length || 0;
      const hrVal = lastVitals?.heart_rate || activeProfile?.biogears_resting_hr || 72;
      const waterVal = waterIntake || 0;

      return (
        <View style={{ marginBottom: 20 }}>
          {/* Main Welcome Hero Card */}
          <View style={[styles.welcomeHeroCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.welcomeHeroHeader}>
              <View style={[styles.welcomeHeroAvatar, { backgroundColor: `${c.accent}15`, borderColor: `${c.accent}30` }]}>
                <Ionicons name="sparkles" size={24} color={c.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.welcomeHeroTitle, { color: c.text }]}>Digital Twin Assistant</Text>
                <View style={styles.welcomeStatusRow}>
                  <View style={[styles.welcomeStatusDot, { backgroundColor: connected ? "#10b981" : "#f59e0b" }]} />
                  <Text style={[styles.welcomeStatusTxt, { color: connected ? "#10b981" : "#f59e0b" }]}>
                    {connected ? "Brain Engine Online" : "Local Twin Mode"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.welcomeDivider, { backgroundColor: c.border }]} />
            <RichText text={displayText} style={[styles.welcomeBodyTxt, { color: c.text }]} />

            {/* Real-time Patient Stream Snapshot */}
            <View style={styles.patientSnapshotRow}>
              <View style={[styles.patientSnapshotPill, { backgroundColor: c.bg, borderColor: c.border }]}>
                <Ionicons name="bandage-outline" size={13} color="#f59e0b" />
                <Text style={[styles.patientSnapshotTxt, { color: c.text }]}>
                  {symptomCount} {symptomCount === 1 ? "Symptom" : "Symptoms"}
                </Text>
              </View>

              <View style={[styles.patientSnapshotPill, { backgroundColor: c.bg, borderColor: c.border }]}>
                <Ionicons name="medkit-outline" size={13} color="#10b981" />
                <Text style={[styles.patientSnapshotTxt, { color: c.text }]}>
                  {medCount} {medCount === 1 ? "Medication" : "Meds"}
                </Text>
              </View>

              <View style={[styles.patientSnapshotPill, { backgroundColor: c.bg, borderColor: c.border }]}>
                <Ionicons name="heart-outline" size={13} color="#ef4444" />
                <Text style={[styles.patientSnapshotTxt, { color: c.text }]}>{hrVal} BPM</Text>
              </View>

              <View style={[styles.patientSnapshotPill, { backgroundColor: c.bg, borderColor: c.border }]}>
                <Ionicons name="water-outline" size={13} color="#0284c7" />
                <Text style={[styles.patientSnapshotTxt, { color: c.text }]}>{waterVal} mL</Text>
              </View>
            </View>
          </View>

          {/* Categorized Health Prompt Cards Grid */}
          <Text style={[styles.promptSectionLabel, { color: c.sub }]}>Explore Health Topics</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}>
            {PROMPT_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.promptCategoryCard, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={() => doSend(cat.query)}
                activeOpacity={0.8}
              >
                <View style={[styles.promptIconWrap, { backgroundColor: `${cat.color}15` }]}>
                  <Ionicons name={cat.icon} size={18} color={cat.color} />
                </View>
                <Text style={[styles.promptCardTitle, { color: c.text }]}>{cat.title}</Text>
                <Text style={[styles.promptCardSub, { color: c.sub }]} numberOfLines={2}>
                  {cat.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      );
    }

    // ── Standard Message Bubbles ───────────────────────────────────────────────
    const userTextColor = "#ffffff";
    const userTimeColor = "rgba(255,255,255,0.75)";

    return (
      <View style={[styles.messageRow, { justifyContent: isUser ? "flex-end" : "flex-start" }]}>
        {!isUser && (
          <View style={[styles.avatar, { backgroundColor: `${c.accent}15`, borderColor: c.border }]}>
            <Ionicons name="sparkles" size={14} color={c.accent} />
          </View>
        )}

        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.aiBubble,
            {
              backgroundColor: isUser ? c.accent : c.card,
              borderColor: isUser ? c.accent : c.border,
            },
          ]}
        >
          {/* Clinical Evidence Card */}
          {!isUser && item.evidenceBundle && <EvidenceCard bundle={item.evidenceBundle} c={c} theme={theme} />}

          {/* Rich Content Text */}
          <RichText text={item.text} style={[styles.messageText, { color: isUser ? userTextColor : c.text }]} />

          {/* Color-Coded Interactive Action Pills */}
          {!isUser && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {(item.text.toLowerCase().includes("water") || item.text.toLowerCase().includes("hydrat")) && (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/(tabs)/history", params: { tab: "hydration" } } as any)}
                  style={[styles.actionPillBtn, { backgroundColor: "#0284c718", borderColor: "#0284c730" }]}
                >
                  <Ionicons name="water" size={12} color="#0284c7" />
                  <Text style={[styles.actionPillTxt, { color: "#0284c7" }]}>Log Hydration</Text>
                </TouchableOpacity>
              )}

              {(item.text.toLowerCase().includes("medicat") ||
                item.text.toLowerCase().includes("dose") ||
                item.text.toLowerCase().includes("pill")) && (
                <TouchableOpacity
                  onPress={() => router.push("/MedicationVault")}
                  style={[styles.actionPillBtn, { backgroundColor: "#10b98118", borderColor: "#10b98130" }]}
                >
                  <Ionicons name="medkit" size={12} color="#10b981" />
                  <Text style={[styles.actionPillTxt, { color: "#10b981" }]}>Med Vault</Text>
                </TouchableOpacity>
              )}

              {(item.text.toLowerCase().includes("symptom") ||
                item.text.toLowerCase().includes("pain") ||
                item.text.toLowerCase().includes("fever")) && (
                <TouchableOpacity
                  onPress={() => router.push("/symptom-log")}
                  style={[styles.actionPillBtn, { backgroundColor: "#f59e0b18", borderColor: "#f59e0b30" }]}
                >
                  <Ionicons name="bandage" size={12} color="#f59e0b" />
                  <Text style={[styles.actionPillTxt, { color: "#f59e0b" }]}>Log Symptom</Text>
                </TouchableOpacity>
              )}

              {(item.text.toLowerCase().includes("lab") ||
                item.text.toLowerCase().includes("report") ||
                item.text.toLowerCase().includes("blood")) && (
                <TouchableOpacity
                  onPress={() => router.push("/(tabs)/documents")}
                  style={[styles.actionPillBtn, { backgroundColor: "#8b5cf618", borderColor: "#8b5cf630" }]}
                >
                  <Ionicons name="document-text" size={12} color="#8b5cf6" />
                  <Text style={[styles.actionPillTxt, { color: "#8b5cf6" }]}>Documents</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Interactive Follow-up Question Chips */}
          {!isUser && (
            <View style={[styles.followupContainer, { borderTopColor: c.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}>
                <Ionicons name="sparkles-outline" size={11} color={c.accent} />
                <Text style={[styles.followupLabel, { color: c.sub }]}>Suggested Follow-ups</Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {(item.followups && item.followups.length > 0 ? item.followups : getQuickSuggestions(item.text)).map(
                  (fText, fIdx) => (
                    <TouchableOpacity
                      key={fIdx}
                      onPress={() => doSend(fText)}
                      activeOpacity={0.7}
                      style={[styles.followupChip, { backgroundColor: c.bg, borderColor: c.border }]}
                    >
                      <Ionicons name="help-circle-outline" size={12} color={c.accent} />
                      <Text style={[styles.followupChipTxt, { color: c.text }]}>{fText}</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            </View>
          )}

          <Text style={[styles.messageTime, { color: isUser ? userTimeColor : c.sub }]}>
            {fmtTime(item.timestamp.getTime())}
          </Text>
        </View>
      </View>
    );
  };

  const patientCtx = getPatientContextPayload();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} backgroundColor={c.bg} />

      {/* Modern Top Header Bar */}
      <View
        style={[
          styles.customHeader,
          {
            backgroundColor: c.card,
            borderBottomColor: c.border,
            paddingTop: insets.top,
            height: 56 + insets.top,
          },
        ]}
      >
        <View style={styles.headerContent}>
          {/* Assistant Title & Twin Context Pill Button */}
          <View style={styles.headerLeft}>
            <View style={[styles.miniAvatar, { backgroundColor: `${c.accent}15` }]}>
              <Ionicons name="sparkles" size={16} color={c.accent} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: c.text }]}>Digital Twin Assistant</Text>
              <TouchableOpacity
                style={styles.headerStatusRow}
                onPress={() => setShowTwinContext(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.headerStatusDot, { backgroundColor: connected ? "#10b981" : "#f59e0b" }]} />
                <Text style={[styles.headerStatusText, { color: connected ? "#10b981" : "#f59e0b" }]}>
                  {connected ? "Brain Engine Online" : "Local Twin Mode"}
                </Text>
                <Ionicons name="chevron-down" size={10} color={c.sub} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Action Header Buttons */}
          <View style={styles.headerActions}>
            {allChunks.length > 0 && (
              <TouchableOpacity
                style={[styles.actionIconBtn, { backgroundColor: c.bg }]}
                onPress={() => setShowAllChunks(true)}
              >
                <Ionicons name="layers-outline" size={16} color={c.accent} />
                {modelLoading && <ActivityIndicator size="small" color={c.accent} style={styles.headerSpinner} />}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionIconBtn, { backgroundColor: c.bg }]}
              onPress={() => setShowHistory(true)}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={c.accent} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionIconBtn, { backgroundColor: c.bg }]}
              onPress={handleNewChat}
            >
              <Ionicons name="add-outline" size={18} color={c.accent} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Main Chat Stream */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={[styles.container, { backgroundColor: c.bg }]}>
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onTouchStart={Keyboard.dismiss}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={loading ? <TypingIndicatorBubble c={c} /> : null}
          />

          {/* Floating Input Bar Container */}
          <View style={{ backgroundColor: c.bg, paddingBottom: Platform.OS === "ios" ? 20 : 12 }}>
            {/* Voice Active Recording Waveform */}
            <VoiceIndicator visible={isRecording} partialText={partialVoiceText} />

            <View style={[styles.inputContainer, { backgroundColor: c.card, borderColor: c.border }]}>
              {/* Add Attachment Action */}
              <TouchableOpacity
                onPress={() => setShowUploadOptions(true)}
                style={styles.iconButton}
                activeOpacity={0.7}
              >
                <Ionicons name="attach" size={22} color={c.accent} />
              </TouchableOpacity>

              {/* Voice Mic Input Toggle */}
              <TouchableOpacity
                onPress={handleVoice}
                style={[styles.iconButton, isRecording && styles.recordingBtn]}
                activeOpacity={0.7}
              >
                <Ionicons name={isRecording ? "mic-off" : "mic"} size={20} color={isRecording ? "#fff" : c.sub} />
              </TouchableOpacity>

              {/* Text Input Field */}
              <View style={[styles.inputWrapper, { backgroundColor: c.bg, borderColor: c.border }]}>
                <TextInput
                  ref={inputRef}
                  value={input}
                  onChangeText={setInput}
                  placeholder="Ask about symptoms, vitals, meds..."
                  placeholderTextColor={c.sub}
                  style={[styles.input, { color: c.text }]}
                  multiline
                  returnKeyType="send"
                  onSubmitEditing={sendMessage}
                  blurOnSubmit={false}
                />
              </View>

              {/* Dynamic Send Button */}
              <TouchableOpacity
                onPress={sendMessage}
                style={[
                  styles.sendButton,
                  { backgroundColor: input.trim() ? c.accent : c.border },
                ]}
                disabled={!input.trim() || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="arrow-up" size={18} color={input.trim() ? "#fff" : c.sub} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Modals & Inspection Sheets */}
      <TwinContextSheet
        visible={showTwinContext}
        onClose={() => setShowTwinContext(false)}
        c={c}
        patientCtx={patientCtx}
      />

      <UploadOptionsModal
        visible={showUploadOptions}
        onClose={() => setShowUploadOptions(false)}
        onPickPdf={() => handleUpload("pdf")}
        onPickImage={() => handleUpload("image")}
        onViewChunks={() => setShowAllChunks(true)}
        c={c}
        chunkCount={allChunks.length}
      />

      <DocViewerModal doc={viewDoc} chunks={allChunks} onClose={() => setViewDoc(null)} c={c} />
      <ProcessingModal
        visible={uploading}
        progress={processingProgress}
        onCancel={() => {
          setUploading(false);
          setProcessingProgress(null);
        }}
        c={c}
      />
      <AllChunksModal
        chunks={allChunks}
        docs={docs}
        visible={showAllChunks}
        onClose={() => setShowAllChunks(false)}
        c={c}
      />

      {/* Chat History Sliding Drawer */}
      <ChatHistoryDrawer
        visible={showHistory}
        sessions={chatSessions}
        onClose={() => setShowHistory(false)}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onNewChat={handleNewChat}
        c={c}
        headerH={headerH}
      />
    </View>
  );
}

// ── Stylesheet ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },

  // Glassmorphic Custom Header
  customHeader: {
    borderBottomWidth: 1,
    zIndex: 999,
    justifyContent: "flex-end",
  },
  headerContent: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  miniAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  headerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  headerStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerStatusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpinner: {
    position: "absolute",
  },

  // Welcome Hero Card & Prompts Grid
  welcomeHeroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    marginBottom: 16,
  },
  welcomeHeroHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  welcomeHeroAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeHeroTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  welcomeStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  welcomeStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  welcomeStatusTxt: {
    fontSize: 11,
    fontWeight: "700",
  },
  welcomeDivider: {
    height: 1,
    marginVertical: 14,
  },
  welcomeBodyTxt: {
    fontSize: 14,
    lineHeight: 22,
  },
  patientSnapshotRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 14,
  },
  patientSnapshotPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  patientSnapshotTxt: {
    fontSize: 11,
    fontWeight: "700",
  },

  promptSectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  promptCategoryCard: {
    width: 155,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "space-between",
  },
  promptIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  promptCardTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 3,
  },
  promptCardSub: {
    fontSize: 11,
    lineHeight: 15,
  },

  // Messages List & Bubbles
  messagesList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 16,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 14,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginBottom: 2,
  },
  messageBubble: {
    maxWidth: "84%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    borderBottomLeftRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  messageTime: {
    fontSize: 10,
    marginTop: 6,
    alignSelf: "flex-end",
  },

  // Action Pills & Followups
  actionPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionPillTxt: {
    fontSize: 11,
    fontWeight: "700",
  },

  followupContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  followupLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  followupChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  followupChipTxt: {
    fontSize: 11,
    fontWeight: "600",
  },

  sysRow: {
    alignItems: "center",
    marginVertical: 10,
  },
  sysPill: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
  },
  sysTxt: {
    fontSize: 11,
    fontStyle: "italic",
  },

  // Floating Input Bar
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 26,
    marginHorizontal: 16,
    gap: 6,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  recordingBtn: {
    backgroundColor: "#ef4444",
  },
  inputWrapper: {
    flex: 1,
    borderRadius: 18,
    minHeight: 38,
    maxHeight: 110,
    justifyContent: "center",
    borderWidth: 1,
  },
  input: {
    fontSize: 14,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },

  // Voice Bar
  voiceIndicatorWrap: {
    backgroundColor: "#ef444415",
    borderTopWidth: 1,
    borderTopColor: "#ef444430",
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 6,
  },
  voiceIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  voiceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  voiceIndicatorTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ef4444",
  },
  voicePartialTxt: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 3,
    fontStyle: "italic",
  },

  // Bottom Sheets & Modals
  sheetOverlay: {
    flex: 1,
    backgroundColor: "#00000077",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#94a3b840",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sheetIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  sheetSub: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  contextMetricCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  contextMetricTitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  contextMetricVal: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 1,
  },

  uploadOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  uploadOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadOptionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  uploadOptionSub: {
    fontSize: 11,
    marginTop: 1,
  },

  // Document & Chunk Views
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef444415",
  },
  docHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  docHeaderTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  docHeaderSub: {
    fontSize: 11,
    marginTop: 2,
  },
  sectionHead: {
    fontSize: 15,
    fontWeight: "800",
  },
  chunkCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  chunkIdx: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  chunkTxt: {
    fontSize: 13,
    lineHeight: 19,
  },
  docSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  docSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    flex: 1,
  },
  docSectionSub: {
    fontSize: 11,
  },
  emptyTxt: {
    fontSize: 13,
    textAlign: "center",
  },

  processingOverlay: {
    flex: 1,
    backgroundColor: "#00000088",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  processingCard: {
    borderRadius: 20,
    padding: 24,
    width: "84%",
    alignItems: "center",
    borderWidth: 1,
  },
  processingTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 6,
  },
  processingMessage: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  progressBarContainer: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 16,
  },
  progressBar: {
    height: "100%",
    borderRadius: 3,
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 20,
  },
  cancelBtnTxt: {
    fontWeight: "700",
    fontSize: 13,
  },

  // Drawer
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 310,
    borderRightWidth: 1,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  drawerTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  drawerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  newChatTxt: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  drawerEmpty: {
    alignItems: "center",
    marginTop: 60,
    paddingHorizontal: 20,
  },
  drawerEmptyTxt: {
    fontSize: 13,
    textAlign: "center",
  },
  drawerGroupLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sessionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sessionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  sessionPreview: {
    fontSize: 11,
    marginTop: 2,
  },
  sessionTime: {
    fontSize: 9,
    marginTop: 3,
  },

  // Hybrid Live Typing Indicator
  typingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  typingCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    gap: 6,
    maxWidth: "80%",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  typingStatusText: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
});