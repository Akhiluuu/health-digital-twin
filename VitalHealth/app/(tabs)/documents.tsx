// app/(tabs)/documents.tsx

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../context/ThemeContext";
import Header from "../components/Header";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportCategory =
  | "Lab"
  | "ECG"
  | "Prescription"
  | "Scan"
  | "Discharge"
  | "Other";

interface StoredDocument {
  id: string;
  title: string;
  date: string;
  dateMs: number;
  category: ReportCategory;
  doctor: string;
  localUri: string;
  originalName: string;
  mimeType: string;
  sizeKb: number;
}

interface CategoryStyle {
  icon: keyof typeof Ionicons.glyphMap;
  lightBg: string;
  darkBg: string;
  lightIcon: string;
  darkIcon: string;
  lightBadge: string;
  darkBadge: string;
  lightBadgeText: string;
  darkBadgeText: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "@vitalhealth_documents_v2";
const DOCS_DIR = (FileSystem.documentDirectory as string) + "health_docs/";

const CATEGORIES: { label: string; value: ReportCategory | "All" }[] = [
  { label: "All",           value: "All"          },
  { label: "Lab Reports",   value: "Lab"          },
  { label: "Prescriptions", value: "Prescription" },
  { label: "Scans",         value: "Scan"         },
  { label: "ECG / Cardio",  value: "ECG"          },
  { label: "Discharge",     value: "Discharge"    },
  { label: "Other",         value: "Other"        },
];

// Animated placeholder items with colors
const PLACEHOLDER_ITEMS = [
  { text: "lab reports…",    color: "#2563eb" },
  { text: "prescriptions…",  color: "#16a34a" },
  { text: "scans & MRIs…",   color: "#d97706" },
  { text: "ECG / cardio…",   color: "#dc2626" },
  { text: "discharge notes…",color: "#9333ea" },
  { text: "documents…",      color: "#0891b2" },
];

const UPLOAD_TYPES: {
  label: string;
  value: ReportCategory;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}[] = [
  { label: "Lab Report",        value: "Lab",          icon: "flask-outline",         description: "Blood tests, urine analysis, cultures"        },
  { label: "Prescription",      value: "Prescription", icon: "medkit-outline",        description: "Doctor prescriptions & medication notes"      },
  { label: "Scan / Imaging",    value: "Scan",         icon: "scan-outline",          description: "X-Ray, MRI, CT scan, ultrasound"              },
  { label: "ECG / Cardio",      value: "ECG",          icon: "pulse-outline",         description: "ECG, echocardiogram, Holter reports"          },
  { label: "Discharge Summary", value: "Discharge",    icon: "document-text-outline", description: "Hospital discharge & operative notes"         },
  { label: "Other",             value: "Other",        icon: "attach-outline",        description: "Referrals, insurance, miscellaneous"          },
];

const CATEGORY_STYLES: Record<ReportCategory, CategoryStyle> = {
  Lab:          { icon: "flask-outline",         lightBg: "#dbeafe", darkBg: "#1a2e3d", lightIcon: "#2563eb", darkIcon: "#5db4e8", lightBadge: "#dbeafe", darkBadge: "#1a2e3d", lightBadgeText: "#1d4ed8", darkBadgeText: "#5db4e8" },
  ECG:          { icon: "pulse-outline",         lightBg: "#fee2e2", darkBg: "#2d1a1a", lightIcon: "#dc2626", darkIcon: "#e06060", lightBadge: "#fee2e2", darkBadge: "#2d1a1a", lightBadgeText: "#b91c1c", darkBadgeText: "#e06060" },
  Prescription: { icon: "medkit-outline",        lightBg: "#dcfce7", darkBg: "#1a2d1a", lightIcon: "#16a34a", darkIcon: "#56c656", lightBadge: "#dcfce7", darkBadge: "#1a2d1a", lightBadgeText: "#15803d", darkBadgeText: "#56c656" },
  Scan:         { icon: "scan-outline",          lightBg: "#fef3c7", darkBg: "#2d2418", lightIcon: "#d97706", darkIcon: "#e0a23d", lightBadge: "#fef3c7", darkBadge: "#2d2418", lightBadgeText: "#b45309", darkBadgeText: "#e0a23d" },
  Discharge:    { icon: "document-text-outline", lightBg: "#f3e8ff", darkBg: "#2a1a2e", lightIcon: "#9333ea", darkIcon: "#b86ed9", lightBadge: "#f3e8ff", darkBadge: "#2a1a2e", lightBadgeText: "#7e22ce", darkBadgeText: "#b86ed9" },
  Other:        { icon: "attach-outline",        lightBg: "#f1f5f9", darkBg: "#1e2530", lightIcon: "#64748b", darkIcon: "#8b949e", lightBadge: "#f1f5f9", darkBadge: "#1e2530", lightBadgeText: "#475569", darkBadgeText: "#8b949e" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileTypeLabel(mimeType: string, originalName: string): string {
  if (mimeType?.includes("pdf"))   return "PDF";
  if (mimeType?.includes("image")) return mimeType.split("/")[1]?.toUpperCase() ?? "Image";
  const ext = originalName.split(".").pop()?.toUpperCase();
  return ext ?? "File";
}

function viewerIcon(mimeType: string): keyof typeof Ionicons.glyphMap {
  if (mimeType?.includes("pdf"))   return "document-text-outline";
  if (mimeType?.includes("image")) return "image-outline";
  return "open-outline";
}

function formatSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function isImage(mimeType: string): boolean {
  return mimeType?.startsWith("image/");
}

function isPdf(mimeType: string, name: string): boolean {
  return mimeType?.includes("pdf") || name?.toLowerCase().endsWith(".pdf");
}

// ─── Animated Placeholder ─────────────────────────────────────────────────────

function AnimatedPlaceholder() {
  const [index, setIndex] = useState(0);
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const cycle = () => {
      // fade + slide out
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -10, duration: 350, useNativeDriver: true }),
      ]).start(() => {
        setIndex((prev) => (prev + 1) % PLACEHOLDER_ITEMS.length);
        slideAnim.setValue(10);
        // fade + slide in
        Animated.parallel([
          Animated.timing(fadeAnim,  { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
        ]).start();
      });
    };

    const interval = setInterval(cycle, 2200);
    return () => clearInterval(interval);
  }, []);

  const item = PLACEHOLDER_ITEMS[index];

  return (
    <Animated.Text
      style={[
        styles.animatedPlaceholder,
        {
          color: item.color,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="none"
    >
      Search {item.text}
    </Animated.Text>
  );
}

// ─── In-App Document Viewer ───────────────────────────────────────────────────

function InAppViewer({
  doc,
  onClose,
  colors,
  isDark,
}: {
  doc: StoredDocument;
  onClose: () => void;
  colors: any;
  isDark: boolean;
}) {
  const [imageError, setImageError] = useState(false);
  const style = CATEGORY_STYLES[doc.category];

  const isImg = isImage(doc.mimeType);
  const isPdf_ = isPdf(doc.mimeType, doc.originalName);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.viewerSafe, { backgroundColor: isDark ? "#0d1117" : "#f6f8fa" }]}>
        {/* Viewer header */}
        <View style={[styles.viewerHeader, { backgroundColor: isDark ? "#161b22" : "#fff", borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.viewerBackBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.viewerTitle, { color: colors.text }]} numberOfLines={1}>{doc.title}</Text>
            <Text style={[styles.viewerSub, { color: colors.sub }]}>{doc.date} · {fileTypeLabel(doc.mimeType, doc.originalName)} · {formatSize(doc.sizeKb)}</Text>
          </View>
          <TouchableOpacity
            onPress={async () => {
              const canShare = await Sharing.isAvailableAsync();
              if (canShare) await Sharing.shareAsync(doc.localUri, { mimeType: doc.mimeType, dialogTitle: doc.title });
            }}
            style={styles.viewerShareBtn}
          >
            <Ionicons name="share-outline" size={20} color={colors.accentText} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.viewerContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          showsVerticalScrollIndicator={false}
        >
          {isImg && !imageError ? (
            // ── Image viewer ──────────────────────────────────────────
            <View style={styles.imageViewerWrap}>
              <Image
                source={{ uri: doc.localUri }}
                style={styles.imageViewer}
                resizeMode="contain"
                onError={() => setImageError(true)}
              />
            </View>
          ) : isPdf_ ? (
            // ── PDF: show metadata card + open externally button ──────
            // expo-file-system doesn't support in-app PDF rendering without
            // react-native-pdf. We show a rich preview card and open externally.
            <View style={[styles.pdfCard, { backgroundColor: isDark ? "#161b22" : "#fff", borderColor: colors.border }]}>
              <View style={[styles.pdfIconCircle, { backgroundColor: isDark ? style.darkBg : style.lightBg }]}>
                <Ionicons name="document-text" size={52} color={isDark ? style.darkIcon : style.lightIcon} />
              </View>
              <Text style={[styles.pdfCardTitle, { color: colors.text }]}>{doc.title}</Text>
              <Text style={[styles.pdfCardSub, { color: colors.sub }]}>{doc.originalName}</Text>

              <View style={[styles.pdfMetaBox, { backgroundColor: isDark ? "#0d1117" : "#f6f8fa", borderColor: colors.border }]}>
                {[
                  { label: "Type",   value: fileTypeLabel(doc.mimeType, doc.originalName) },
                  { label: "Size",   value: formatSize(doc.sizeKb) },
                  { label: "Date",   value: doc.date },
                  { label: "Source", value: doc.doctor },
                ].map((row, i) => (
                  <View key={row.label} style={[styles.pdfMetaRow, i < 3 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
                    <Text style={[styles.pdfMetaLabel, { color: colors.sub }]}>{row.label}</Text>
                    <Text style={[styles.pdfMetaValue, { color: colors.text }]}>{row.value}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.pdfOpenBtn, { backgroundColor: isDark ? style.darkBg : style.lightBg }]}
                onPress={async () => {
                  try {
                    if (Platform.OS === "android") {
                      try {
                        const IntentLauncher = require("expo-intent-launcher");
                        const contentUri = await FileSystem.getContentUriAsync(doc.localUri);
                        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
                          data: contentUri, flags: 1, type: doc.mimeType || "application/pdf",
                        });
                        return;
                      } catch {}
                    }
                    const canShare = await Sharing.isAvailableAsync();
                    if (canShare) await Sharing.shareAsync(doc.localUri, { mimeType: doc.mimeType, dialogTitle: doc.title });
                  } catch (e: any) { Alert.alert("Error", e.message); }
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="open-outline" size={20} color={isDark ? style.darkIcon : style.lightIcon} />
                <Text style={[styles.pdfOpenBtnText, { color: isDark ? style.darkIcon : style.lightIcon }]}>
                  Open in PDF Viewer
                </Text>
              </TouchableOpacity>

              <Text style={[styles.pdfNote, { color: colors.sub }]}>
                For full PDF rendering, open in your device's PDF reader app.
              </Text>
            </View>
          ) : (
            // ── Generic file: open externally ─────────────────────────
            <View style={[styles.pdfCard, { backgroundColor: isDark ? "#161b22" : "#fff", borderColor: colors.border }]}>
              <View style={[styles.pdfIconCircle, { backgroundColor: isDark ? style.darkBg : style.lightBg }]}>
                <Ionicons name="document-attach" size={52} color={isDark ? style.darkIcon : style.lightIcon} />
              </View>
              <Text style={[styles.pdfCardTitle, { color: colors.text }]}>{doc.title}</Text>
              <Text style={[styles.pdfCardSub, { color: colors.sub }]}>{doc.originalName}</Text>
              <TouchableOpacity
                style={[styles.pdfOpenBtn, { backgroundColor: isDark ? style.darkBg : style.lightBg, marginTop: 20 }]}
                onPress={async () => {
                  const canShare = await Sharing.isAvailableAsync();
                  if (canShare) await Sharing.shareAsync(doc.localUri, { mimeType: doc.mimeType, dialogTitle: doc.title });
                }}
              >
                <Ionicons name="share-outline" size={20} color={isDark ? style.darkIcon : style.lightIcon} />
                <Text style={[styles.pdfOpenBtnText, { color: isDark ? style.darkIcon : style.lightIcon }]}>Open / Share File</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DocumentsScreen() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = isDark
    ? {
        bg: "#0d1117", card: "#161b22", border: "#21262d", text: "#c9d1d9",
        sub: "#8b949e", muted: "#30363d", accent: "#1d6fa4", accentText: "#5db4e8",
        headerBg: "#0d1117", filterActive: "#1d6fa4", filterActiveBorder: "#2788c0",
        filterActiveText: "#e0f0ff", filterInactive: "#161b22",
        filterInactiveBorder: "#21262d", filterInactiveText: "#8b949e",
        statsChip: "#161b22", statsChipBorder: "#21262d", statsText: "#8b949e",
        statsValue: "#c9d1d9", sectionLabel: "#4b5563", modalBg: "#161b22",
        modalOverlay: "rgba(0,0,0,0.75)", uploadRow: "#1c2128",
        uploadRowBorder: "#21262d", emptyIcon: "#21262d", emptyIconFg: "#30363d",
        searchBg: "#161b22", danger: "#ef4444", dangerBg: "#2d1a1a",
        viewBtn: "#1a2e3d", viewBtnText: "#5db4e8",
      }
    : {
        bg: "#f6f8fa", card: "#ffffff", border: "#e5e7eb", text: "#111827",
        sub: "#9ca3af", muted: "#e5e7eb", accent: "#2563eb", accentText: "#2563eb",
        headerBg: "#f6f8fa", filterActive: "#2563eb", filterActiveBorder: "#1d4ed8",
        filterActiveText: "#ffffff", filterInactive: "#ffffff",
        filterInactiveBorder: "#e5e7eb", filterInactiveText: "#6b7280",
        statsChip: "#ffffff", statsChipBorder: "#e5e7eb", statsText: "#6b7280",
        statsValue: "#111827", sectionLabel: "#9ca3af", modalBg: "#ffffff",
        modalOverlay: "rgba(0,0,0,0.45)", uploadRow: "#f9fafb",
        uploadRowBorder: "#f3f4f6", emptyIcon: "#f3f4f6", emptyIconFg: "#d1d5db",
        searchBg: "#ffffff", danger: "#ef4444", dangerBg: "#fee2e2",
        viewBtn: "#dbeafe", viewBtnText: "#2563eb",
      };

  // ── State ──────────────────────────────────────────────────────────────────
  const [documents,        setDocuments]        = useState<StoredDocument[]>([]);
  const [activeFilter,     setActiveFilter]     = useState<ReportCategory | "All">("All");
  const [searchQuery,      setSearchQuery]       = useState("");
  const [searchFocused,    setSearchFocused]     = useState(false);
  const [showUploadModal,  setShowUploadModal]  = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(null);
  const [reportName,       setReportName]        = useState("");
  const [pickedFileName,   setPickedFileName]    = useState<string | null>(null);
  const [pickedFileUri,    setPickedFileUri]     = useState<string | null>(null);
  const [pickedMime,       setPickedMime]        = useState<string>("application/octet-stream");
  const [pickedSizeKb,     setPickedSizeKb]      = useState<number>(0);
  const [uploading,        setUploading]         = useState(false);
  const [viewingDoc,       setViewingDoc]        = useState<StoredDocument | null>(null);
  // In-app viewer state
  const [inAppDoc,         setInAppDoc]          = useState<StoredDocument | null>(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  const ensureDir = useCallback(async () => {
    const info = await FileSystem.getInfoAsync(DOCS_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DOCS_DIR, { intermediates: true });
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: StoredDocument[] = JSON.parse(raw);
        parsed.sort((a, b) => b.dateMs - a.dateMs);
        setDocuments(parsed);
      }
    } catch (e) { console.log("❌ loadDocuments error:", e); }
  }, []);

  useEffect(() => {
    (async () => { await ensureDir(); await loadDocuments(); })();
  }, []);

  const saveDocuments = async (docs: StoredDocument[]) => {
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(docs)); }
    catch (e) { console.log("❌ saveDocuments error:", e); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = documents.filter((d) => {
    const matchesFilter = activeFilter === "All" || d.category === activeFilter;
    const matchesSearch = searchQuery.trim() === "" ||
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.doctor.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const thisMonth = documents.filter((d) => {
    const now = new Date(); const docDate = new Date(d.dateMs);
    return docDate.getMonth() === now.getMonth() && docDate.getFullYear() === now.getFullYear();
  }).length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const resetModalState = () => {
    setSelectedCategory(null); setReportName(""); setPickedFileName(null);
    setPickedFileUri(null); setPickedMime("application/octet-stream"); setPickedSizeKb(0);
  };

  const handleCloseModal = () => { setShowUploadModal(false); resetModalState(); };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (!result.canceled && result.assets.length > 0) {
        const file = result.assets[0];
        setPickedFileName(file.name); setPickedFileUri(file.uri);
        setPickedMime(file.mimeType ?? "application/octet-stream");
        const info = await FileSystem.getInfoAsync(file.uri);
        setPickedSizeKb(Math.round(((info as any).size ?? 0) / 1024));
        if (!reportName) setReportName(file.name.replace(/\.[^/.]+$/, ""));
      }
    } catch { Alert.alert("Error", "Could not open the file picker. Please try again."); }
  };

  const handleConfirmUpload = async () => {
    if (!reportName.trim()) { Alert.alert("Name required", "Please enter a name for this report."); return; }
    if (!pickedFileUri || !pickedFileName) { Alert.alert("File required", "Please select a file to upload."); return; }
    setUploading(true);
    try {
      await ensureDir();
      const ext = pickedFileName.split(".").pop() ?? "bin";
      const destName = `${Date.now()}_${reportName.trim().replace(/\s+/g, "_")}.${ext}`;
      const destUri  = DOCS_DIR + destName;
      await FileSystem.copyAsync({ from: pickedFileUri, to: destUri });
      const now = new Date();
      const newDoc: StoredDocument = {
        id: Date.now().toString(), title: reportName.trim(),
        date: now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        dateMs: now.getTime(), category: selectedCategory!, doctor: "Uploaded by you",
        localUri: destUri, originalName: pickedFileName, mimeType: pickedMime, sizeKb: pickedSizeKb,
      };
      const updated = [newDoc, ...documents];
      setDocuments(updated); await saveDocuments(updated);
      handleCloseModal();
      Alert.alert("✅ Saved", `"${newDoc.title}" has been stored locally.`);
    } catch (e: any) { Alert.alert("Upload failed", e.message ?? "Could not save the file."); }
    finally { setUploading(false); }
  };

  /** Open document — images & PDFs open in-app, others open externally */
  const handleOpenDocument = async (doc: StoredDocument) => {
    try {
      const info = await FileSystem.getInfoAsync(doc.localUri);
      if (!info.exists) { Alert.alert("File not found", "The file may have been deleted from local storage."); return; }

      // Always open in-app viewer (handles images natively, PDFs with metadata + external fallback)
      setViewingDoc(null);
      setInAppDoc(doc);
    } catch (e: any) { Alert.alert("Error", e.message ?? "Could not open the file."); }
  };

  const handleShareDocument = async (doc: StoredDocument) => {
    try {
      const info = await FileSystem.getInfoAsync(doc.localUri);
      if (!info.exists) { Alert.alert("File not found", "The file may have been deleted."); return; }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(doc.localUri, { mimeType: doc.mimeType, dialogTitle: doc.title, UTI: doc.mimeType });
      else Alert.alert("Sharing not available", "Sharing is not supported on this device.");
    } catch (e: any) { Alert.alert("Error", e.message ?? "Could not share the file."); }
  };

  const handleDeleteDocument = (doc: StoredDocument) => {
    Alert.alert("Delete Document", `Are you sure you want to permanently delete "${doc.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          const info = await FileSystem.getInfoAsync(doc.localUri);
          if (info.exists) await FileSystem.deleteAsync(doc.localUri, { idempotent: true });
          const updated = documents.filter((d) => d.id !== doc.id);
          setDocuments(updated); await saveDocuments(updated);
          if (viewingDoc?.id === doc.id) setViewingDoc(null);
          if (inAppDoc?.id === doc.id) setInAppDoc(null);
        } catch (e: any) { Alert.alert("Error", e.message ?? "Could not delete the file."); }
      }},
    ]);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderDocument = ({ item }: { item: StoredDocument }) => {
    const style = CATEGORY_STYLES[item.category];
    const fileLabel = fileTypeLabel(item.mimeType, item.originalName);
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        activeOpacity={0.75}
        onPress={() => setViewingDoc(item)}
        onLongPress={() => handleDeleteDocument(item)}
      >
        <View style={[styles.iconBox, { backgroundColor: isDark ? style.darkBg : style.lightBg }]}>
          <Ionicons name={style.icon} size={20} color={isDark ? style.darkIcon : style.lightIcon} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[styles.cardMeta, { color: colors.sub }]}>{item.date} · {fileLabel} · {formatSize(item.sizeKb)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: isDark ? style.darkBadge : style.lightBadge }]}>
          <Text style={[styles.badgeText, { color: isDark ? style.darkBadgeText : style.lightBadgeText }]}>{item.category}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.muted} />
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconCircle, { backgroundColor: colors.emptyIcon }]}>
        <Ionicons name="documents-outline" size={36} color={colors.emptyIconFg} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No documents yet</Text>
      <Text style={[styles.emptyDesc, { color: colors.sub }]}>
        {activeFilter === "All" ? "Tap the + button to add your first medical document." : `No ${activeFilter} documents added yet.`}
      </Text>
    </View>
  );

  // ── Upload Modal ──────────────────────────────────────────────────────────

  const renderCategoryStep = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={[styles.modalTitle, { color: colors.text }]}>Add Document</Text>
      <Text style={[styles.modalSub, { color: colors.sub }]}>Select the type of report to upload</Text>
      {UPLOAD_TYPES.map((type) => {
        const catStyle = CATEGORY_STYLES[type.value];
        return (
          <TouchableOpacity
            key={type.value}
            style={[styles.uploadRow, { backgroundColor: colors.uploadRow, borderBottomColor: colors.uploadRowBorder }]}
            onPress={() => { setSelectedCategory(type.value); setReportName(""); setPickedFileName(null); setPickedFileUri(null); }}
            activeOpacity={0.7}
          >
            <View style={[styles.uploadIcon, { backgroundColor: isDark ? catStyle.darkBg : catStyle.lightBg }]}>
              <Ionicons name={type.icon} size={18} color={isDark ? catStyle.darkIcon : catStyle.lightIcon} />
            </View>
            <View style={styles.uploadInfo}>
              <Text style={[styles.uploadLabel, { color: colors.text }]}>{type.label}</Text>
              <Text style={[styles.uploadDesc, { color: colors.sub }]}>{type.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.sub} />
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={handleCloseModal}>
        <Text style={[styles.cancelText, { color: colors.sub }]}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderUploadStep = () => {
    const catStyle = CATEGORY_STYLES[selectedCategory!];
    const canSubmit = reportName.trim().length > 0 && pickedFileName !== null;
    const typeInfo  = UPLOAD_TYPES.find((t) => t.value === selectedCategory);
    return (
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.modalTitleRow}>
          <TouchableOpacity onPress={() => setSelectedCategory(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={18} color={colors.sub} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>{typeInfo?.label}</Text>
        </View>
        <Text style={[styles.modalSub, { color: colors.sub, marginTop: 4 }]}>Enter a name and attach the file</Text>

        <View style={styles.inputSection}>
          <Text style={[styles.inputLabel, { color: colors.sub }]}>REPORT NAME *</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.uploadRow, borderColor: colors.border, color: colors.text }]}
            placeholder="e.g. Blood Test – Jan 2026"
            placeholderTextColor={colors.sub}
            value={reportName} onChangeText={setReportName} returnKeyType="done"
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={[styles.inputLabel, { color: colors.sub }]}>ATTACH FILE *</Text>
          <Text style={[styles.inputHint, { color: colors.sub }]}>Supports PDF, Images (JPG/PNG), DOCX, and more</Text>
          <TouchableOpacity
            style={[styles.filePicker, {
              backgroundColor: colors.uploadRow,
              borderColor: pickedFileName ? colors.accent : colors.border,
              borderStyle: pickedFileName ? "solid" : "dashed",
            }]}
            onPress={handlePickFile} activeOpacity={0.7}
          >
            {pickedFileName ? (
              <>
                <View style={[styles.fileIconBox, { backgroundColor: isDark ? catStyle.darkBg : catStyle.lightBg }]}>
                  <Ionicons name={viewerIcon(pickedMime)} size={18} color={isDark ? catStyle.darkIcon : catStyle.lightIcon} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fileNameText, { color: colors.text }]} numberOfLines={1}>{pickedFileName}</Text>
                  <Text style={[styles.fileTapText, { color: colors.sub }]}>
                    {fileTypeLabel(pickedMime, pickedFileName)} · {formatSize(pickedSizeKb)} · Tap to change
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
              </>
            ) : (
              <View style={styles.filePickerEmpty}>
                <Ionicons name="cloud-upload-outline" size={30} color={colors.sub} />
                <Text style={[styles.filePickerText, { color: colors.sub }]}>Tap to browse files</Text>
                <Text style={[styles.filePickerHint, { color: colors.muted }]}>PDF, Image, DOCX, or any format</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: canSubmit && !uploading ? colors.accent : colors.muted }]}
          onPress={handleConfirmUpload} activeOpacity={canSubmit ? 0.85 : 1} disabled={uploading}
        >
          {uploading
            ? <Text style={[styles.confirmText, { color: "#fff" }]}>Saving…</Text>
            : <>
                <Ionicons name="save-outline" size={18} color={canSubmit ? "#fff" : colors.sub} />
                <Text style={[styles.confirmText, { color: canSubmit ? "#fff" : colors.sub }]}>Save Document Locally</Text>
              </>
          }
        </TouchableOpacity>
        <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={handleCloseModal}>
          <Text style={[styles.cancelText, { color: colors.sub }]}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ── Detail modal ──────────────────────────────────────────────────────────

  const renderDetailModal = () => {
    if (!viewingDoc) return null;
    const style = CATEGORY_STYLES[viewingDoc.category];
    const fileLabel = fileTypeLabel(viewingDoc.mimeType, viewingDoc.originalName);
    return (
      <Modal visible={!!viewingDoc} transparent animationType="fade" onRequestClose={() => setViewingDoc(null)}>
        <View style={[styles.detailOverlay, { backgroundColor: colors.modalOverlay }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setViewingDoc(null)} />
          <View style={[styles.detailCard, { backgroundColor: colors.card }]}>
            <View style={[styles.detailIconBox, { backgroundColor: isDark ? style.darkBg : style.lightBg }]}>
              <Ionicons name={viewerIcon(viewingDoc.mimeType)} size={34} color={isDark ? style.darkIcon : style.lightIcon} />
            </View>
            <Text style={[styles.detailTitle, { color: colors.text }]} numberOfLines={2}>{viewingDoc.title}</Text>
            <View style={[styles.badge, { backgroundColor: isDark ? style.darkBadge : style.lightBadge, marginBottom: 8 }]}>
              <Text style={[styles.badgeText, { color: isDark ? style.darkBadgeText : style.lightBadgeText }]}>{viewingDoc.category}</Text>
            </View>

            {[
              { icon: "calendar-outline",        label: "Date",      value: viewingDoc.date               },
              { icon: "document-outline",        label: "File type", value: fileLabel                     },
              { icon: "server-outline",          label: "Size",      value: formatSize(viewingDoc.sizeKb) },
              { icon: "person-outline",          label: "Source",    value: viewingDoc.doctor              },
              { icon: "document-attach-outline", label: "File",      value: viewingDoc.originalName        },
            ].map((row) => (
              <View key={row.label} style={[styles.metaRow, { borderColor: colors.border }]}>
                <Ionicons name={row.icon as any} size={14} color={colors.sub} style={{ marginRight: 8 }} />
                <Text style={[styles.metaLabel, { color: colors.sub }]}>{row.label}</Text>
                <Text style={[styles.metaValue, { color: colors.text }]} numberOfLines={1}>{row.value}</Text>
              </View>
            ))}

            <View style={styles.detailActions}>
              {/* Open in-app */}
              <TouchableOpacity
                style={[styles.detailBtn, { backgroundColor: colors.viewBtn, flex: 2 }]}
                onPress={() => handleOpenDocument(viewingDoc)}
                activeOpacity={0.8}
              >
                <Ionicons name="eye-outline" size={18} color={colors.viewBtnText} />
                <Text style={[styles.detailBtnText, { color: colors.viewBtnText }]}>View File</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.detailBtn, { backgroundColor: isDark ? "#1c2128" : "#f1f5f9", flex: 1 }]}
                onPress={() => handleShareDocument(viewingDoc)}
                activeOpacity={0.8}
              >
                <Ionicons name="share-outline" size={18} color={colors.sub} />
                <Text style={[styles.detailBtnText, { color: colors.sub }]}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.detailBtn, { backgroundColor: isDark ? colors.dangerBg : "#fee2e2" }]}
                onPress={() => handleDeleteDocument(viewingDoc)}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.detailClose, { borderColor: colors.border }]}
              onPress={() => setViewingDoc(null)}
            >
              <Text style={[styles.cancelText, { color: colors.sub }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* ── App Header (same as other pages) ────────────────────────────── */}
      <Header />

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: 100 }]}>
        <Text style={[styles.headerSuper, { color: colors.sectionLabel }]}>HEALTH RECORDS</Text>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Documents</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll}>
          {[
            { label: "Total",      value: String(documents.length)  },
            { label: "This month", value: String(thisMonth)          },
            { label: "Last added", value: documents[0]?.date ?? "—" },
          ].map((s) => (
            <View key={s.label} style={[styles.statsChip, { backgroundColor: colors.statsChip, borderColor: colors.statsChipBorder }]}>
              <Text style={[styles.statsLabel, { color: colors.statsText }]}>{s.label}  </Text>
              <Text style={[styles.statsValue, { color: colors.statsValue }]}>{s.value}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* ── Animated Search Bar ──────────────────────────────────────────── */}
      <View style={[styles.searchRow, { backgroundColor: colors.searchBg, borderColor: searchFocused ? colors.accent : colors.border }]}>
        <Ionicons name="search-outline" size={16} color={searchFocused ? colors.accent : colors.sub} style={{ marginRight: 8 }} />

        <View style={{ flex: 1, justifyContent: "center" }}>
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {/* Animated placeholder — only shown when input is empty and not focused */}
          {searchQuery.length === 0 && !searchFocused && (
            <View style={styles.placeholderOverlay} pointerEvents="none">
              <AnimatedPlaceholder />
            </View>
          )}
        </View>

        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={16} color={colors.sub} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filter pills ─────────────────────────────────────────────────── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={[styles.filterScrollView, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.filterScroll}
      >
        {CATEGORIES.map((cat) => {
          const isActive = activeFilter === cat.value;
          return (
            <TouchableOpacity
              key={cat.value}
              onPress={() => setActiveFilter(cat.value as ReportCategory | "All")}
              style={[styles.filterPill, {
                backgroundColor: isActive ? colors.filterActive      : colors.filterInactive,
                borderColor:     isActive ? colors.filterActiveBorder : colors.filterInactiveBorder,
              }]}
            >
              <Text style={[styles.filterText, { color: isActive ? colors.filterActiveText : colors.filterInactiveText }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Count label ──────────────────────────────────────────────────── */}
      <Text style={[styles.sectionLabel, { color: colors.sectionLabel }]}>
        {activeFilter === "All" ? "ALL DOCUMENTS" : activeFilter.toUpperCase()}
        {"  "}
        <Text style={{ fontWeight: "400" }}>({filtered.length})</Text>
        {documents.length > 0 && (
          <Text style={{ fontWeight: "400" }}>{"  "}· Long-press to delete</Text>
        )}
      </Text>

      {/* ── Document list ─────────────────────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderDocument}
        contentContainerStyle={[styles.listContent, filtered.length === 0 && styles.listContentEmpty]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
      />

      {/* ── FAB ──────────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.accent }]}
        onPress={() => setShowUploadModal(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {renderDetailModal()}

      {/* ── In-App Viewer ────────────────────────────────────────────────── */}
      {inAppDoc && (
        <InAppViewer
          doc={inAppDoc}
          onClose={() => setInAppDoc(null)}
          colors={colors}
          isDark={isDark}
        />
      )}

      {/* ── Upload modal ─────────────────────────────────────────────────── */}
      <Modal visible={showUploadModal} transparent animationType="slide" onRequestClose={handleCloseModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <TouchableOpacity
            style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}
            activeOpacity={1} onPress={handleCloseModal}
          />
          <View style={[styles.modalSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            {selectedCategory === null ? renderCategoryStep() : renderUploadStep()}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header:      { paddingHorizontal: 20, paddingBottom: 10 },
  headerSuper: { fontSize: 10, fontWeight: "600", letterSpacing: 1.2, marginBottom: 2 },
  headerTitle: { fontSize: 26, fontWeight: "600", marginBottom: 12 },
  statsScroll: { flexDirection: "row" },
  statsChip:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5, marginRight: 8 },
  statsLabel:  { fontSize: 12 },
  statsValue:  { fontSize: 12, fontWeight: "600" },

  // Search
  searchRow: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 20, marginBottom: 0,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1,
  },
  searchInput:        { flex: 1, fontSize: 14, color: "transparent" },
  placeholderOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "center" },
  animatedPlaceholder:{ fontSize: 14, fontWeight: "500" },

  // Filters
  filterScrollView: { flexGrow: 0, flexShrink: 0, height: 50, marginTop: 10, marginBottom: 0, borderBottomWidth: 0 },
  filterScroll:     { paddingHorizontal: 20, gap: 8, alignItems: "center", paddingBottom: 6, paddingTop: 4 },
  filterPill:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 0.5, alignSelf: "center" },
  filterText:       { fontSize: 12, fontWeight: "500" },

  sectionLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },

  // List
  listContent:      { paddingHorizontal: 20, paddingBottom: 100, gap: 10 },
  listContentEmpty: { flex: 1, justifyContent: "center" },

  // Empty state
  emptyContainer:  { alignItems: "center", paddingHorizontal: 40, paddingVertical: 20 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle:      { fontSize: 17, fontWeight: "600", marginBottom: 8, textAlign: "center" },
  emptyDesc:       { fontSize: 13, textAlign: "center", lineHeight: 20 },

  // Card
  card:     { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 0.5, gap: 12 },
  iconBox:  { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1, minWidth: 0 },
  cardTitle:{ fontSize: 14, fontWeight: "500" },
  cardMeta: { fontSize: 12, marginTop: 2 },
  badge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText:{ fontSize: 10, fontWeight: "600" },

  // FAB
  fab: {
    position: "absolute", bottom: 24, right: 20,
    width: 54, height: 54, borderRadius: 27,
    alignItems: "center", justifyContent: "center", elevation: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8,
  },

  // Upload modal
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  modalSheet:   { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, paddingTop: 12, maxHeight: "88%" },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle:   { fontSize: 18, fontWeight: "600", paddingHorizontal: 20, marginBottom: 4 },
  modalSub:     { fontSize: 13, paddingHorizontal: 20, marginBottom: 16 },
  modalTitleRow:{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 4, gap: 10 },
  backBtn:      { padding: 4 },

  uploadRow:  { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 0.5, gap: 14 },
  uploadIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  uploadInfo: { flex: 1 },
  uploadLabel:{ fontSize: 14, fontWeight: "500" },
  uploadDesc: { fontSize: 12, marginTop: 1 },

  inputSection: { paddingHorizontal: 20, marginTop: 16 },
  inputLabel:   { fontSize: 11, fontWeight: "600", letterSpacing: 0.8, marginBottom: 8 },
  inputHint:    { fontSize: 11, marginBottom: 8, opacity: 0.7 },
  textInput:    { borderWidth: 0.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },

  filePicker:      { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  filePickerEmpty: { flex: 1, alignItems: "center", gap: 6 },
  fileIconBox:     { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fileNameText:    { fontSize: 13, fontWeight: "500" },
  fileTapText:     { fontSize: 11, marginTop: 2 },
  filePickerText:  { fontSize: 14, fontWeight: "500" },
  filePickerHint:  { fontSize: 12 },

  confirmBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginTop: 24, paddingVertical: 14, borderRadius: 12 },
  confirmText: { fontSize: 15, fontWeight: "600" },
  cancelBtn:   { marginHorizontal: 20, marginTop: 14, paddingVertical: 13, borderRadius: 12, borderWidth: 0.5, alignItems: "center" },
  cancelText:  { fontSize: 14, fontWeight: "500" },

  // Detail modal
  detailOverlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  detailCard:    { width: "100%", borderRadius: 24, padding: 24, alignItems: "center", elevation: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20 },
  detailIconBox: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  detailTitle:   { fontSize: 17, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  metaRow:       { flexDirection: "row", alignItems: "center", width: "100%", paddingVertical: 9, borderBottomWidth: 0.5 },
  metaLabel:     { fontSize: 12, width: 72 },
  metaValue:     { fontSize: 13, fontWeight: "500", flex: 1, textAlign: "right" },
  detailActions: { flexDirection: "row", gap: 10, marginTop: 20, width: "100%" },
  detailBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12 },
  detailBtnText: { fontSize: 14, fontWeight: "600" },
  detailClose:   { marginTop: 14, width: "100%", paddingVertical: 13, borderRadius: 12, borderWidth: 0.5, alignItems: "center" },

  // In-App Viewer
  viewerSafe:     { flex: 1 },
  viewerHeader:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  viewerBackBtn:  { padding: 4, marginRight: 4 },
  viewerShareBtn: { padding: 4, marginLeft: 8 },
  viewerTitle:    { fontSize: 15, fontWeight: "600" },
  viewerSub:      { fontSize: 12, marginTop: 2 },
  viewerContent:  { flexGrow: 1, alignItems: "center", padding: 16 },

  // Image viewer
  imageViewerWrap:{ width: "100%", minHeight: SCREEN_H * 0.7, alignItems: "center", justifyContent: "center" },
  imageViewer:    { width: SCREEN_W - 32, height: SCREEN_H * 0.72 },

  // PDF card (in-app)
  pdfCard:        { width: "100%", borderRadius: 20, borderWidth: 0.5, padding: 28, alignItems: "center", marginTop: 8 },
  pdfIconCircle:  { width: 96, height: 96, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  pdfCardTitle:   { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 6 },
  pdfCardSub:     { fontSize: 13, textAlign: "center", marginBottom: 20 },
  pdfMetaBox:     { width: "100%", borderRadius: 14, borderWidth: 0.5, overflow: "hidden", marginBottom: 20 },
  pdfMetaRow:     { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  pdfMetaLabel:   { fontSize: 13 },
  pdfMetaValue:   { fontSize: 13, fontWeight: "600" },
  pdfOpenBtn:     { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginBottom: 12 },
  pdfOpenBtnText: { fontSize: 15, fontWeight: "600" },
  pdfNote:        { fontSize: 12, textAlign: "center", lineHeight: 18, opacity: 0.7 },
});