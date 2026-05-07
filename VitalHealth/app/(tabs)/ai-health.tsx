// app/(tabs)/ai-health.tsx
// AI Health Page with ON-DEVICE Chunking, Embedding, Chat History & Voice-to-Text

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { PermissionsAndroid } from "react-native";

import { useTheme } from "../../context/ThemeContext";
import { colors } from "../../theme/colors";
import Header from "../components/Header";
import { useMedicine } from "../../context/MedicineContext";
import { useSymptoms } from "../../context/SymptomContext";

// Import our on-device services
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

// ─── Voice Recognition ────────────────────────────────────────────────────────
// Uses @react-native-voice/voice for real speech-to-text.
// Install: npx expo install @react-native-voice/voice
// iOS: add NSMicrophoneUsageDescription & NSSpeechRecognitionUsageDescription to Info.plist
// Android: add RECORD_AUDIO permission to AndroidManifest.xml
let Voice: any = null;
try {
  Voice = require("@react-native-voice/voice").default;
} catch {
  // If not installed, voice feature shows a helpful alert
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KEY_SERVER_IP    = "@hai_server_ip";
const KEY_SERVER_PORT  = "@hai_server_port";
const KEY_CHAT_HISTORY = "@hai_chat_history";
const DEFAULT_PORT     = "8000";
const DEFAULT_AI_URL   = "http://151.185.42.123/ai";
const TOP_K            = 5;
const MAX_SAVED_SESSIONS = 30;

// ─── Utility Functions ────────────────────────────────────────────────────────

const buildUrl = (ip: string, port: string) => {
  const cleaned = ip.trim().replace(/\/$/, "");
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) return cleaned;
  return `http://${cleaned}:${(port || "8000").trim()}`;
};

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

const fmtRelativeDate = (ts: number): string => {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days} days ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  text: string;
  sender: "user" | "ai" | "system";
  timestamp: Date;
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
};

type ChatSession = {
  id: string;
  title: string;
  preview: string;
  startedAt: number;
  updatedAt: number;
  messages: SerializedMessage[];
};

// ─── Chat History Helpers ─────────────────────────────────────────────────────

const loadChatHistory = async (): Promise<ChatSession[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY_CHAT_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveChatHistory = async (sessions: ChatSession[]) => {
  try {
    const trimmed = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SAVED_SESSIONS);
    await AsyncStorage.setItem(KEY_CHAT_HISTORY, JSON.stringify(trimmed));
  } catch {}
};

const serializeMessages   = (msgs: Message[]): SerializedMessage[] =>
  msgs.map((m) => ({ ...m, timestamp: m.timestamp.getTime() }));

const deserializeMessages = (msgs: SerializedMessage[]): Message[] =>
  msgs.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));

const buildSessionTitle   = (messages: Message[]) =>
  messages.find((m) => m.sender === "user")?.text.slice(0, 50) ?? "New conversation";

const buildSessionPreview = (messages: Message[]) => {
  const last = [...messages].reverse().find((m) => m.sender === "ai");
  return last ? last.text.replace(/\*\*/g, "").slice(0, 80) + "…" : "";
};

// ─── Server Config Modal ──────────────────────────────────────────────────────

function ServerConfigModal({
  visible, ip, port, onSave, onClose, c,
}: {
  visible: boolean; ip: string; port: string;
  onSave: (ip: string, port: string) => void;
  onClose: () => void; c: any;
}) {
  const [localIp, setLocalIp]     = useState(ip);
  const [localPort, setLocalPort] = useState(port);
  const [testing, setTesting]     = useState(false);
  const [result, setResult]       = useState<"ok" | "fail" | null>(null);

  useEffect(() => { setLocalIp(ip); setLocalPort(port); setResult(null); }, [ip, port, visible]);

  const test = async () => {
    setTesting(true); setResult(null);
    try {
      const r = await fetch(`${buildUrl(localIp, localPort)}/health`);
      setResult(r.ok ? "ok" : "fail");
    } catch { setResult("fail"); } finally { setTesting(false); }
  };

  if (!visible) return null;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.modalTitle, { color: c.text }]}>⚙️ Server Settings</Text>
          <Text style={[styles.modalSub, { color: c.sub }]}>
            Enter the full AI server URL (e.g. http://151.185.42.123/ai).{"\n"}
            Chunking and embedding happen on this device!
          </Text>
          <Text style={[styles.fieldLabel, { color: c.sub }]}>Laptop IP Address</Text>
          <View style={[styles.fieldRow, { backgroundColor: c.bg, borderColor: c.border }]}>
            <Text style={styles.fieldIcon}>🌐</Text>
            <TextInput
              style={[styles.fieldInput, { color: c.text }]} value={localIp} onChangeText={setLocalIp}
              placeholder="e.g. http://151.185.42.123/ai" placeholderTextColor={c.sub}
              keyboardType="numeric" autoCapitalize="none" autoCorrect={false}
            />
          </View>
          <Text style={[styles.fieldLabel, { color: c.sub }]}>Port</Text>
          <View style={[styles.fieldRow, { backgroundColor: c.bg, borderColor: c.border }]}>
            <Text style={styles.fieldIcon}>🔌</Text>
            <TextInput
              style={[styles.fieldInput, { color: c.text }]} value={localPort} onChangeText={setLocalPort}
              placeholder="8000" placeholderTextColor={c.sub} keyboardType="numeric"
            />
          </View>
          <TouchableOpacity
            style={[styles.testBtn, { backgroundColor: c.accent }, (testing || !localIp.trim()) && { opacity: 0.5 }]}
            onPress={test} disabled={testing || !localIp.trim()}
          >
            {testing ? <ActivityIndicator color="#fff" size="small" /> :
              <Text style={styles.testBtnTxt}>🔍 Test Connection</Text>}
          </TouchableOpacity>
          {result === "ok"   && <Text style={[styles.resultTxt, { color: "#10b981" }]}>✅ Server reachable!</Text>}
          {result === "fail" && <Text style={[styles.resultTxt, { color: "#ef4444" }]}>❌ Cannot connect — check IP and WiFi</Text>}
          <View style={{ flexDirection: "row", marginTop: 6 }}>
            <TouchableOpacity
              style={[styles.modalBtn, { marginRight: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg }]}
              onPress={onClose}
            ><Text style={[styles.modalBtnTxt, { color: c.sub }]}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: c.accent }, !localIp.trim() && { opacity: 0.4 }]}
              onPress={() => onSave(localIp, localPort)} disabled={!localIp.trim()}
            ><Text style={[styles.modalBtnTxt, { color: "#fff" }]}>Save ✓</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Document Viewer Modal ────────────────────────────────────────────────────

function DocViewerModal({ doc, chunks, onClose, c }: { doc: Doc | null; chunks: EmbeddedChunk[]; onClose: () => void; c: any }) {
  if (!doc) return null;
  const docChunks = chunks.filter((ch) => ch.metadata?.docId === doc.id);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={[styles.docHeader, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docHeaderTitle, { color: c.text }]} numberOfLines={1}>{doc.name}</Text>
            <Text style={[styles.docHeaderSub, { color: c.sub }]}>{doc.type} · {docChunks.length} chunks · {fmtDate(doc.uploadedAt)}</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <Text style={[styles.iconBtnTxt, { color: "#ef4444" }]}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1, paddingHorizontal: 14 }}>
          <Text style={[styles.sectionHead, { marginTop: 10, marginBottom: 8, color: c.text }]}>📄 Extracted Text (On-Device)</Text>
          {docChunks.length === 0
            ? <Text style={[styles.emptyTxt, { color: c.sub }]}>No text extracted.</Text>
            : docChunks.map((ch, i) => (
              <View key={i} style={[styles.chunkCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.chunkIdx, { color: c.accent }]}>Chunk {i + 1}</Text>
                <Text style={[styles.chunkTxt, { color: c.sub }]}>{ch.text}</Text>
              </View>
            ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── All Chunks Viewer Modal ──────────────────────────────────────────────────

function AllChunksModal({ chunks, docs, visible, onClose, c }: { chunks: EmbeddedChunk[]; docs: Doc[]; visible: boolean; onClose: () => void; c: any }) {
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={[styles.docHeader, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docHeaderTitle, { color: c.text }]}>📋 All Chunks</Text>
            <Text style={[styles.docHeaderSub, { color: c.sub }]}>{chunks.length} chunks from {docs.length} docs</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <Text style={[styles.iconBtnTxt, { color: "#ef4444" }]}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1, paddingHorizontal: 14 }}>
          {chunks.length === 0
            ? <View style={{ alignItems: "center", marginTop: 40 }}>
                <Text style={[styles.emptyTxt, { color: c.sub, fontSize: 16 }]}>⚠️ No documents uploaded yet</Text>
              </View>
            : docs.map((doc) => {
                const docChunks = chunks.filter((ch) => ch.metadata?.docId === doc.id);
                return (
                  <View key={doc.id} style={{ marginBottom: 16 }}>
                    <View style={[styles.docSectionHeader, { backgroundColor: c.card, borderColor: c.border }]}>
                      <Text style={[styles.docSectionTitle, { color: c.text }]} numberOfLines={1}>📄 {doc.name}</Text>
                      <Text style={[styles.docSectionSub, { color: c.sub }]}>{docChunks.length} chunks</Text>
                    </View>
                    {docChunks.map((ch, i) => (
                      <View key={ch.id} style={[styles.chunkCard, { backgroundColor: c.bg, borderColor: c.border }]}>
                        <Text style={[styles.chunkIdx, { color: c.accent }]}>Chunk {i + 1}</Text>
                        <Text style={[styles.chunkTxt, { color: c.sub }]}>{ch.text}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Processing Modal ─────────────────────────────────────────────────────────

function ProcessingModal({ visible, progress, onCancel, c }: { visible: boolean; progress: ProcessingProgress | null; onCancel: () => void; c: any }) {
  if (!visible || !progress) return null;
  const color = progress.stage === "complete" ? "#10b981" : progress.stage === "error" ? "#ef4444" : c.accent;
  const icon  = { extracting: "📝", chunking: "✂️", embedding: "🧠", storing: "💾", complete: "✅", error: "❌" }[progress.stage] ?? "⏳";
  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.processingOverlay}>
        <View style={[styles.processingCard, { backgroundColor: c.card }]}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={[styles.processingTitle, { color: c.text }]}>{icon} Processing Document</Text>
          <Text style={[styles.processingMessage, { color: c.sub }]}>{progress.message}</Text>
          {progress.stage !== "complete" && progress.stage !== "error" && (
            <View style={[styles.progressBarContainer, { backgroundColor: c.border }]}>
              <View style={[styles.progressBar, { width: `${progress.progress}%`, backgroundColor: color }]} />
            </View>
          )}
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={[styles.cancelBtnTxt, { color: "#ef4444" }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Chat History Drawer ──────────────────────────────────────────────────────

function ChatHistoryDrawer({
  visible, sessions, onClose, onSelectSession, onDeleteSession, onNewChat, c,
}: {
  visible: boolean;
  sessions: ChatSession[];
  onClose: () => void;
  onSelectSession: (s: ChatSession) => void;
  onDeleteSession: (id: string) => void;
  onNewChat: () => void;
  c: any;
}) {
  const slideAnim   = useRef(new Animated.Value(-340)).current;
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

  // Group by relative date
  const dateMap: Record<string, ChatSession[]> = {};
  sessions.forEach((s) => {
    const label = fmtRelativeDate(s.updatedAt);
    if (!dateMap[label]) dateMap[label] = [];
    dateMap[label].push(s);
  });
  const grouped = [
    ...["Today", "Yesterday"].filter((k) => dateMap[k]).map((k) => ({ label: k, data: dateMap[k] })),
    ...Object.keys(dateMap).filter((k) => !["Today", "Yesterday"].includes(k)).map((k) => ({ label: k, data: dateMap[k] })),
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayAnim }]}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1, backgroundColor: "#00000066" }} />
        </TouchableWithoutFeedback>
      </Animated.View>

      <Animated.View style={[styles.drawer, { backgroundColor: c.card, borderRightColor: c.border, transform: [{ translateX: slideAnim }] }]}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={[styles.drawerHeader, { borderBottomColor: c.border }]}>
            <View>
              <Text style={[styles.drawerTitle, { color: c.text }]}>💬 Chats</Text>
              <Text style={[styles.drawerSub, { color: c.sub }]}>{sessions.length} conversations</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
              <Ionicons name="close" size={22} color={c.sub} />
            </TouchableOpacity>
          </View>

          {/* New Chat */}
          <TouchableOpacity style={[styles.newChatBtn, { backgroundColor: c.accent }]} onPress={() => { onNewChat(); onClose(); }}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newChatTxt}>New Conversation</Text>
          </TouchableOpacity>

          {/* Session list */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {sessions.length === 0 ? (
              <View style={styles.drawerEmpty}>
                <Text style={{ fontSize: 36, marginBottom: 10 }}>🩺</Text>
                <Text style={[styles.drawerEmptyTxt, { color: c.sub }]}>No past conversations yet.</Text>
                <Text style={[styles.drawerEmptyTxt, { color: c.sub, marginTop: 4, fontSize: 12 }]}>Start chatting with Dr. Aria!</Text>
              </View>
            ) : grouped.map(({ label, data }) => (
              <View key={label}>
                <Text style={[styles.drawerGroupLabel, { color: c.sub }]}>{label}</Text>
                {data.map((session) => (
                  <TouchableOpacity
                    key={session.id}
                    style={[styles.sessionItem, { borderBottomColor: c.border }]}
                    onPress={() => { onSelectSession(session); onClose(); }}
                    onLongPress={() => Alert.alert("Delete conversation?", session.title, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => onDeleteSession(session.id) },
                    ])}
                  >
                    <View style={[styles.sessionIconWrap, { backgroundColor: c.bg }]}>
                      <Text style={{ fontSize: 16 }}>🩺</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sessionTitle, { color: c.text }]} numberOfLines={1}>{session.title}</Text>
                      <Text style={[styles.sessionPreview, { color: c.sub }]} numberOfLines={2}>{session.preview || "Tap to continue…"}</Text>
                      <Text style={[styles.sessionTime, { color: c.sub }]}>{fmtDate(session.updatedAt)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

// ─── Voice Recording Indicator ────────────────────────────────────────────────

function VoiceIndicator({ visible, partialText }: { visible: boolean; partialText: string }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (visible) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
      ])).start();
    } else {
      pulseAnim.stopAnimation(); pulseAnim.setValue(1);
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <View style={styles.voiceIndicatorWrap}>
      <View style={styles.voiceIndicatorRow}>
        <Animated.View style={[styles.voiceDot, { transform: [{ scale: pulseAnim }] }]} />
        <Text style={styles.voiceIndicatorTxt}>Listening… tap mic to stop</Text>
      </View>
      {!!partialText && <Text style={styles.voicePartialTxt} numberOfLines={2}>{partialText}</Text>}
    </View>
  );
}

// ─── Rich Text Renderer ───────────────────────────────────────────────────────

function RichText({ text, style }: { text: string; style?: any }) {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/gs;
  let lastIndex = 0; let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex)
      parts.push(<Text key={`p-${lastIndex}`} style={style}>{text.slice(lastIndex, match.index)}</Text>);
    if (match[1] !== undefined)
      parts.push(<Text key={`b-${match.index}`} style={[style, { fontWeight: "900" }]}>{match[1]}</Text>);
    else if (match[2] !== undefined)
      parts.push(<Text key={`i-${match.index}`} style={[style, { fontStyle: "italic" }]}>{match[2]}</Text>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(<Text key="pe" style={style}>{text.slice(lastIndex)}</Text>);
  return <Text style={style}>{parts}</Text>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIHealthScreen() {
  const { symptom } = useLocalSearchParams<{ symptom?: string; source?: string }>();
  const { theme }   = useTheme();
  const c           = colors[theme];
  const { medicines }                      = useMedicine();
  const { activeSymptoms, historySymptoms } = useSymptoms();

  // Server
  const [serverIp, setServerIp]     = useState(DEFAULT_AI_URL);
  const [serverPort, setServerPort] = useState(DEFAULT_PORT);
  const [connected, setConnected]   = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);

  // Documents
  const [docs, setDocs]                   = useState<Doc[]>([]);
  const [allChunks, setAllChunks]         = useState<EmbeddedChunk[]>([]);
  const [viewDoc, setViewDoc]             = useState<Doc | null>(null);
  const [showAllChunks, setShowAllChunks] = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);

  // Chat history
  const [chatSessions, setChatSessions]         = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory]           = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string>(genId());

  // Voice
  const [isRecording, setIsRecording]         = useState(false);
  const [partialVoiceText, setPartialVoiceText] = useState("");

  // Chat
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", text: "👋 Connecting to Dr. Aria…", sender: "system", timestamp: new Date() },
  ]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [autoSent, setAutoSent] = useState(false);

  const listRef    = useRef<FlatList>(null);
  const inputRef   = useRef<TextInput>(null);
  const historyRef = useRef<string[]>([]);

  // ── Voice setup ─────────────────────────────────────────────────────────────

// ── Voice setup ─────────────────────────────────────────────────────────────

useEffect(() => {
  if (!Voice) return;

  // Assign handlers once on mount
  Voice.onSpeechStart = () => {
    setIsRecording(true);
    setPartialVoiceText("");
  };

  Voice.onSpeechEnd = () => {
    // Don't set isRecording(false) here — wait for onSpeechResults
    // so the UI doesn't flicker before we get the result
  };

  Voice.onSpeechError = (e: any) => {
    setIsRecording(false);
    setPartialVoiceText("");
    const code = e?.error?.code?.toString();
    // Code "7" = no match (user said nothing), suppress that alert
    if (code !== "7") {
      Alert.alert("Voice Error", e?.error?.message || "Could not recognise speech");
    }
  };

  Voice.onSpeechPartialResults = (e: any) => {
    setPartialVoiceText(e?.value?.[0] || "");
  };

  Voice.onSpeechResults = (e: any) => {
    const result = e?.value?.[0] || "";
    setPartialVoiceText("");
    setIsRecording(false);
    if (result.trim()) {
      setInput(result.trim());
    }
  };

  // Cleanup: destroy Voice engine on unmount only
  return () => {
    Voice.destroy().then(() => {
      Voice.removeAllListeners(); // call AFTER destroy resolves
    }).catch(() => {});
  };
}, []); // ← empty array: runs once on mount, cleans up on unmount


// ── Request mic permission ───────────────────────────────────────────────────

const requestMicPermission = async (): Promise<boolean> => {
  if (Platform.OS === "android") {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone Permission",
          message: "Health AI needs microphone access for voice input.",
          buttonPositive: "Allow",
          buttonNegative: "Deny",
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }
  return true; // iOS: permissions are handled via Info.plist
};


// ── Voice toggle ─────────────────────────────────────────────────────────────

const handleVoice = async () => {
  if (!Voice) {
    Alert.alert(
      "Voice Not Available",
      "Install @react-native-voice/voice and rebuild the app."
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
    Alert.alert(
      "Permission Denied",
      "Microphone permission is required for voice input. Enable it in Settings."
    );
    return;
  }

  setPartialVoiceText("");

  try {
    // Destroy any leftover session before starting a new one
    await Voice.destroy().catch(() => {});
    await Voice.start("en-US"); // use en-US for broadest device support
  } catch (e: any) {
    setIsRecording(false);
    Alert.alert("Voice Error", e?.message || "Cannot start voice recognition.");
  }
};
  // ── Fetch greeting ──────────────────────────────────────────────────────────

  const fetchGreeting = async (ip: string, port: string) => {
    try {
      const res  = await fetch(`${buildUrl(ip, port)}/greeting`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const text = data.message || "👋 Hello! I'm **Dr. Aria**, your personal health assistant. How may I help you today?";
      setMessages([{ id: "welcome", text, sender: "ai", timestamp: new Date() }]);
    } catch {
      setMessages([{ id: "welcome", text: "👋 Hello! I'm **Dr. Aria**, your personal health assistant.\n\nConfigure the server IP (⚙️) to get started.", sender: "ai", timestamp: new Date() }]);
    }
  };

  // ── Mount: load everything ───────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const ip      = (await AsyncStorage.getItem(KEY_SERVER_IP))   || "";
        const port    = (await AsyncStorage.getItem(KEY_SERVER_PORT)) || DEFAULT_PORT;
        const d       = await loadDocuments();
        const ch      = await loadChunks();
        const history = await loadChatHistory();

        setServerIp(ip); setServerPort(port); setDocs(d); setAllChunks(ch); setChatSessions(history);

        if (!ip) { setShowConfig(true); }
        else {
          try { const r = await fetch(`${buildUrl(ip, port)}/health`); setConnected(r.ok); } catch { setConnected(false); }
          await fetchGreeting(ip, port);
        }
        setModelLoading(true);
        generateEmbedding("warmup").finally(() => setModelLoading(false));
      } catch (e) { console.error(e); }
    })();
  }, []);

  // ── Persist current conversation ────────────────────────────────────────────

  useEffect(() => {
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
      saveChatHistory(updated);
      return updated;
    });
  }, [messages]);

  // ── Auto-send symptom ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!symptom || autoSent || !serverIp) return;
    const text = Array.isArray(symptom) ? symptom[0] : symptom;
    if (!text.trim()) return;
    const t = setTimeout(async () => { await doSend(text); setAutoSent(true); }, 800);
    return () => clearTimeout(t);
  }, [symptom, serverIp]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────

  useEffect(() => { setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100); }, [messages]);

  // ── Save config ─────────────────────────────────────────────────────────────

  const handleSaveConfig = async (ip: string, port: string) => {
    const cleanIp = ip.trim(); const cleanPort = (port || DEFAULT_PORT).trim();
    setServerIp(cleanIp); setServerPort(cleanPort); setShowConfig(false);
    try { await AsyncStorage.setItem(KEY_SERVER_IP, cleanIp); await AsyncStorage.setItem(KEY_SERVER_PORT, cleanPort); } catch {}
    try { const r = await fetch(`${buildUrl(cleanIp, cleanPort)}/health`); setConnected(r.ok); } catch { setConnected(false); }
    await fetchGreeting(cleanIp, cleanPort);
  };

  // ── New / restore chat ──────────────────────────────────────────────────────

  const handleNewChat = async () => {
    setCurrentSessionId(genId()); historyRef.current = [];
    await fetchGreeting(serverIp, serverPort);
  };

  const handleSelectSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(deserializeMessages(session.messages));
    const uAndA = session.messages.filter((m) => m.sender !== "system");
    historyRef.current = uAndA.map((m) => m.text).slice(-10);
  };

  const handleDeleteSession = async (id: string) => {
    const updated = chatSessions.filter((s) => s.id !== id);
    setChatSessions(updated); await saveChatHistory(updated);
    if (id === currentSessionId) handleNewChat();
  };

  // ── Send message ────────────────────────────────────────────────────────────

  const doSend = async (query: string) => {
    if (!query.trim() || loading) return;
    if (!serverIp) { setShowConfig(true); return; }

    setMessages((prev) => [...prev, { id: genId(), text: query, sender: "user", timestamp: new Date() }]);
    setLoading(true);

    const baseUrl = buildUrl(serverIp, serverPort);
    const history = [...historyRef.current];

    try {
      let topChunks: string[] = [];
      if (allChunks.length > 0) {
        const qEmb = await generateEmbedding(query);
        topChunks  = retrieveTopKChunks(qEmb, allChunks, TOP_K).map((r) => r.chunk.text);
      }
      const genRes = await fetch(`${baseUrl}/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, chunks: topChunks, history, patient_context: { medicines: medicines || [], activeSymptoms: activeSymptoms || [], historySymptoms: historySymptoms || [] } }),
      });
      if (!genRes.ok) { const err = await genRes.json().catch(() => ({})); throw new Error(err.detail || `Generate failed: ${genRes.status}`); }
      const aiReply: string = (await genRes.json()).response || "No response from server.";
      setMessages((prev) => [...prev, { id: genId(), text: aiReply, sender: "ai", timestamp: new Date() }]);
      historyRef.current = [...history, query, aiReply].slice(-10);
      setConnected(true);
    } catch (e: any) {
      setConnected(false);
      setMessages((prev) => [...prev, { id: genId(), text: `❌ ${e.message}`, sender: "system", timestamp: new Date() }]);
    } finally { setLoading(false); }
  };

  const sendMessage = async () => { const q = input.trim(); setInput(""); await doSend(q); };

  // ── Upload ──────────────────────────────────────────────────────────────────

  const handleUpload = async (type: "pdf" | "image") => {
    setUploading(true);
    setProcessingProgress({ stage: "extracting", progress: 0, message: "Selecting document…" });
    try {
      const document = type === "image" ? await pickImage() : await pickDocument();
      if (!document) { setUploading(false); setProcessingProgress(null); return; }
      const { document: newDoc, chunks: newChunks } = await processDocument(document, { chunkSize: 500, chunkOverlap: 100, onProgress: setProcessingProgress });
      const updatedDocs = [...docs, newDoc]; const updatedChunks = [...allChunks, ...newChunks];
      setDocs(updatedDocs); setAllChunks(updatedChunks);
      await saveDocuments(updatedDocs); await saveChunks(updatedChunks);
      Alert.alert("✅ Document Processed", `"${newDoc.name}" — ${newDoc.chunkCount} chunks created on-device.`);
    } catch (e: any) { Alert.alert("Error", e.message || "Failed to process document"); }
    finally { setUploading(false); setProcessingProgress(null); }
  };

  const handleFile = () => Alert.alert("Upload Document", "Document will be processed on-device", [
    { text: "PDF / Lab Report",   onPress: () => handleUpload("pdf") },
    { text: "Prescription Image", onPress: () => handleUpload("image") },
    { text: "Cancel", style: "cancel" },
  ]);


  // ── Bubble colours ──────────────────────────────────────────────────────────

  const getUserBubbleColor  = () => theme === "light" ? "#2563eb" : "#3b82f6";
  const getAiBubbleColor    = () => theme === "light" ? "#f1f5f9" : "#1e293b";
  const getUserBubbleBorder = () => theme === "light" ? "#1d4ed8" : "#2563eb";
  const getAiBubbleBorder   = () => theme === "light" ? "#e2e8f0" : "#334155";

  // ── Message renderer ────────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === "user"; const isSystem = item.sender === "system";
    if (isSystem) return (
      <View style={styles.sysRow}>
        <View style={[styles.sysPill, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.sysTxt, { color: c.sub }]}>{item.text}</Text>
        </View>
      </View>
    );
    return (
      <View style={[styles.messageRow, { justifyContent: isUser ? "flex-end" : "flex-start" }]}>
        {!isUser && <View style={[styles.avatar, { backgroundColor: c.card, borderColor: c.border }]}><Text style={{ fontSize: 14 }}>🩺</Text></View>}
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble, { backgroundColor: isUser ? getUserBubbleColor() : getAiBubbleColor(), borderColor: isUser ? getUserBubbleBorder() : getAiBubbleBorder() }]}>
          <RichText text={item.text} style={[styles.messageText, { color: isUser ? "#ffffff" : c.text }]} />
          <Text style={[styles.messageTime, { color: isUser ? "#ffffff80" : c.sub }]}>{fmtTime(item.timestamp.getTime())}</Text>
        </View>
      </View>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} backgroundColor={c.bg} />
      <Header />

      {/* Page header */}
      <View style={[styles.header, { backgroundColor: c.bg, borderBottomColor: c.border, paddingTop: 110 }]}>
        <View style={styles.headerLeft}>
          {/* Chat History button */}
          <TouchableOpacity style={[styles.historyBtn, { backgroundColor: c.card, borderColor: c.border }]} onPress={() => setShowHistory(true)}>
            <Ionicons name="chatbubbles-outline" size={15} color={c.accent} />
            <Text style={[styles.historyBtnTxt, { color: c.accent }]}>Chats</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.text }]}>🩺 Health AI</Text>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, { backgroundColor: connected ? "#10b981" : "#ef4444" }]} />
            <Text style={[styles.statusLabel, { color: c.sub }]}>{connected ? "Connected" : "Not connected"}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {/* New chat icon */}
          <TouchableOpacity style={[styles.newChatIconBtn, { borderColor: c.border, backgroundColor: c.card }]} onPress={handleNewChat}>
            <Ionicons name="create-outline" size={16} color={c.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowConfig(true)} style={[styles.urlPill, { borderColor: c.border, backgroundColor: c.card }]}>
            <Text style={[styles.urlPillTxt, { color: c.accent }]} numberOfLines={1}>{serverIp ? buildUrl(serverIp, serverPort) : "⚙ Set server IP"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowConfig(true)}>
            <Text style={[styles.iconBtnTxt, { color: c.text }]}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* RAG bar */}
      {allChunks.length > 0 && (
        <View style={[styles.ragBar, { backgroundColor: c.card, borderBottomColor: c.border }]}>
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center" }} onPress={() => setShowAllChunks(true)}>
            <Text style={[styles.ragBarTxt, { color: c.accent }]}>🔍 On-device RAG · {allChunks.length} chunks</Text>
            {modelLoading && <ActivityIndicator size="small" color={c.accent} style={{ marginLeft: 8 }} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleUpload("pdf")}>
            <Text style={[styles.ragBarTxt, { color: c.sub }]}>+ Upload</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Chat + input */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
        <View style={[styles.container, { backgroundColor: c.bg }]}>
          <FlatList
            ref={listRef} data={messages} renderItem={renderMessage}
            keyExtractor={(item) => item.id} contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false} onTouchStart={Keyboard.dismiss} keyboardShouldPersistTaps="handled"
          />

          {/* Voice indicator */}
          <VoiceIndicator visible={isRecording} partialText={partialVoiceText} />

          <View style={[styles.inputContainer, { backgroundColor: c.card, borderTopColor: c.border }]}>
            <TouchableOpacity onPress={handleFile} style={styles.iconButton}>
              <Ionicons name="attach" size={24} color={c.sub} />
            </TouchableOpacity>
            <View style={[styles.inputWrapper, { backgroundColor: c.bg, borderColor: isRecording ? "#ef4444" : c.border }]}>
              <TextInput
                ref={inputRef} value={input} onChangeText={setInput}
                placeholder={isRecording ? "Listening…" : "Ask about your health…"}
                placeholderTextColor={isRecording ? "#ef4444" : c.sub}
                style={[styles.input, { color: c.text }]}
                multiline returnKeyType="send" onSubmitEditing={sendMessage} blurOnSubmit={false}
              />
            </View>
            {/* Mic — red pill when recording */}
            <TouchableOpacity onPress={handleVoice} style={[styles.iconButton, isRecording && styles.recordingBtn]}>
              <Ionicons name={isRecording ? "stop-circle" : "mic"} size={24} color={isRecording ? "#fff" : c.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={sendMessage} style={[styles.sendButton, { backgroundColor: input.trim() ? c.accent : c.border }]} disabled={!input.trim() || loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={20} color={input.trim() ? "#ffffff" : c.sub} />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Modals */}
      <ServerConfigModal visible={showConfig} ip={serverIp} port={serverPort} onSave={handleSaveConfig} onClose={() => setShowConfig(false)} c={c} />
      <DocViewerModal doc={viewDoc} chunks={allChunks} onClose={() => setViewDoc(null)} c={c} />
      <ProcessingModal visible={uploading} progress={processingProgress} onCancel={() => { setUploading(false); setProcessingProgress(null); }} c={c} />
      <AllChunksModal chunks={allChunks} docs={docs} visible={showAllChunks} onClose={() => setShowAllChunks(false)} c={c} />

      {/* Chat History Drawer — rendered last so it floats on top */}
      <ChatHistoryDrawer
        visible={showHistory} sessions={chatSessions}
        onClose={() => setShowHistory(false)} onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession} onNewChat={handleNewChat} c={c}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 }, flex: { flex: 1 }, container: { flex: 1 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1 },
  headerLeft: { flex: 1 }, headerRight: { flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", lineHeight: 22 },
  statusContainer: { flexDirection: "row", alignItems: "center" },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 4 },
  statusLabel: { fontSize: 11, lineHeight: 14 },
  urlPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, maxWidth: 150, marginRight: 4 },
  urlPillTxt: { fontSize: 10, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  iconBtn: { padding: 4 }, iconBtnTxt: { fontSize: 18 },

  // New: history + new-chat buttons in header
  historyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginBottom: 4, alignSelf: "flex-start" },
  historyBtnTxt: { fontSize: 12, fontWeight: "600" },
  newChatIconBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 6 },

  ragBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 6, borderBottomWidth: 1 },
  ragBarTxt: { fontSize: 11, fontWeight: "600" },

  messagesList: { paddingHorizontal: 16, paddingBottom: 10, paddingTop: 10 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 8, marginBottom: 2 },
  messageBubble: { maxWidth: "75%", padding: 12, borderRadius: 18, borderWidth: 1 },
  userBubble: { borderBottomRightRadius: 4, marginLeft: 8 },
  aiBubble: { borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  messageTime: { fontSize: 10, marginTop: 4, alignSelf: "flex-end" },
  sysRow: { alignItems: "center", marginVertical: 5 },
  sysPill: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1 },
  sysTxt: { fontSize: 12, fontStyle: "italic" },

  inputContainer: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, gap: 8 },
  iconButton: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  recordingBtn: { backgroundColor: "#ef4444", borderRadius: 20 },
  inputWrapper: { flex: 1, borderRadius: 24, minHeight: 40, maxHeight: 100, justifyContent: "center", borderWidth: 1 },
  input: { fontSize: 15, paddingHorizontal: 16, paddingVertical: 8, textAlignVertical: "center" },
  sendButton: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },

  // Voice indicator
  voiceIndicatorWrap: { backgroundColor: "#ef444415", borderTopWidth: 1, borderTopColor: "#ef444430", paddingHorizontal: 16, paddingVertical: 8 },
  voiceIndicatorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  voiceDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" },
  voiceIndicatorTxt: { fontSize: 13, fontWeight: "600", color: "#ef4444" },
  voicePartialTxt: { fontSize: 13, color: "#64748b", marginTop: 4, fontStyle: "italic" },

  // Chat history drawer
  drawer: { position: "absolute", left: 0, top: 0, bottom: 0, width: 320, borderRightWidth: 1, elevation: 20, shadowColor: "#000", shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.3, shadowRadius: 12 },
  drawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  drawerTitle: { fontSize: 18, fontWeight: "800" },
  drawerSub: { fontSize: 12, marginTop: 2 },
  newChatBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 16, marginTop: 28, paddingVertical: 12, borderRadius: 14 },
  newChatTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  drawerEmpty: { alignItems: "center", marginTop: 60, paddingHorizontal: 20 },
  drawerEmptyTxt: { fontSize: 14, textAlign: "center" },
  drawerGroupLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 16, paddingVertical: 8 },
  sessionItem: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sessionIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sessionTitle: { fontSize: 14, fontWeight: "600", lineHeight: 18 },
  sessionPreview: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  sessionTime: { fontSize: 10, marginTop: 4 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { borderRadius: 20, padding: 24, width: "100%", maxWidth: 400, borderWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  modalSub: { fontSize: 13, marginBottom: 18, lineHeight: 19 },
  fieldLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  fieldRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, marginBottom: 14 },
  fieldIcon: { fontSize: 16, marginRight: 8 },
  fieldInput: { flex: 1, paddingVertical: 12, fontSize: 15, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  testBtn: { borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 10 },
  testBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  resultTxt: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  modalBtnTxt: { fontWeight: "700", fontSize: 15 },

  docHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  docHeaderTitle: { fontSize: 16, fontWeight: "700" },
  docHeaderSub: { fontSize: 11, marginTop: 2 },
  sectionHead: { fontSize: 15, fontWeight: "700" },
  chunkCard: { borderRadius: 10, padding: 12, borderWidth: 1, marginBottom: 10 },
  chunkIdx: { fontSize: 11, fontWeight: "600", marginBottom: 5 },
  chunkTxt: { fontSize: 13, lineHeight: 20 },
  docSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  docSectionTitle: { fontSize: 14, fontWeight: "700", flex: 1, marginRight: 8 },
  docSectionSub: { fontSize: 11 },
  emptyTxt: { fontSize: 13, textAlign: "center", marginTop: 20 },

  processingOverlay: { flex: 1, backgroundColor: "#000000aa", justifyContent: "center", alignItems: "center", padding: 20 },
  processingCard: { borderRadius: 20, padding: 24, width: "80%", alignItems: "center" },
  processingTitle: { fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  processingMessage: { fontSize: 14, textAlign: "center", marginBottom: 16 },
  progressBarContainer: { width: "100%", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 16 },
  progressBar: { height: "100%", borderRadius: 4 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 24 },
  cancelBtnTxt: { fontWeight: "600" },
});