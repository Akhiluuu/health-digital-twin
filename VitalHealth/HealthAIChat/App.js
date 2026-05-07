/**
 * Health AI Chat — v2.2
 * Fixes: Android HTTP cleartext, KeyboardAvoidingView, gap → margin
 * Theme: light green / mint
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILE_ID      = 'profile-1';
const KEY_SERVER_IP   = '@hai_server_ip';
const KEY_SERVER_PORT = '@hai_server_port';
const KEY_DOCUMENTS   = '@hai_documents';
const KEY_CHUNKS      = '@hai_chunks';
const DEFAULT_PORT    = '8001';
const TOP_K           = 5;

// ─── Light green theme ────────────────────────────────────────────────────────

const C = {
  // Backgrounds
  bg:           '#f0fdf4',   // very light mint
  bgAlt:        '#ffffff',
  panel:        '#ffffff',
  panelAlt:     '#f0fdf4',
  panelDeep:    '#dcfce7',

  // Borders
  border:       '#bbf7d0',
  borderDark:   '#86efac',

  // Accent — emerald / green
  accent:       '#16a34a',   // strong green
  accentLight:  '#22c55e',   // lighter green
  accentPale:   '#dcfce7',   // very pale green for chips/tags
  accentDim:    '#15803d',

  // Status
  green:        '#16a34a',
  red:          '#dc2626',
  amber:        '#d97706',
  blue:         '#2563eb',

  // Text
  text:         '#14532d',   // deep forest green for primary text
  textMid:      '#166534',
  textDim:      '#4d7c5f',
  muted:        '#86a892',
  placeholder:  '#a7c4ae',

  // Bubbles
  userBub:      '#16a34a',
  userBubBorder:'#15803d',
  aiBub:        '#ffffff',
  aiBubBorder:  '#bbf7d0',

  // Header
  headerBg:     '#f0fdf4',
  tabActive:    '#16a34a',
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const buildUrl = (ip, port) =>
  `http://${ip.trim().replace(/^https?:\/\//, '')}:${(port || '8000').trim()}`;
const genId   = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDate = ts => new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function cosineSim(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function retrieveTopK(queryEmbedding, allChunks, k = TOP_K) {
  if (!allChunks || allChunks.length === 0) return [];
  const scored = allChunks.map(c => ({
    text: c.text,
    score: cosineSim(queryEmbedding, c.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(s => s.text);
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function loadDocuments() {
  try { const r = await AsyncStorage.getItem(KEY_DOCUMENTS); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
async function saveDocuments(docs) {
  try { await AsyncStorage.setItem(KEY_DOCUMENTS, JSON.stringify(docs)); } catch {}
}
async function loadAllChunks() {
  try { const r = await AsyncStorage.getItem(KEY_CHUNKS); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
async function saveAllChunks(chunks) {
  try { await AsyncStorage.setItem(KEY_CHUNKS, JSON.stringify(chunks)); } catch {}
}

// ─── Rich text renderer ───────────────────────────────────────────────────────

function renderInline(text, baseStyle) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={i} style={[baseStyle, { fontWeight: '700', color: C.text }]}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return <Text key={i} style={baseStyle}>{part}</Text>;
  });
}

function RichText({ text }) {
  const lines = text.split('\n');
  const elements = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    if (!trimmed) {
      elements.push(<View key={`gap-${i}`} style={{ height: 5 }} />);
      return;
    }

    // Header  ###
    if (/^#{1,3}\s/.test(trimmed)) {
      const level = (trimmed.match(/^#+/) || [''])[0].length;
      const content = trimmed.replace(/^#+\s*/, '');
      elements.push(
        <Text key={i} style={[s.rtHeader, { fontSize: level === 1 ? 17 : level === 2 ? 15 : 14 }]}>
          {content}
        </Text>
      );
      return;
    }

    // Divider
    if (/^[-─═]{3,}$/.test(trimmed)) {
      elements.push(<View key={i} style={s.rtDivider} />);
      return;
    }

    // Bullet  - or •
    if (/^[-•*]\s/.test(trimmed)) {
      const content = trimmed.slice(2);
      elements.push(
        <View key={i} style={s.rtBulletRow}>
          <Text style={s.rtBulletDot}>•</Text>
          <Text style={s.rtBulletTxt}>{renderInline(content, s.rtBulletTxt)}</Text>
        </View>
      );
      return;
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\./)[1];
      const content = trimmed.replace(/^\d+\.\s*/, '');
      elements.push(
        <View key={i} style={s.rtBulletRow}>
          <Text style={[s.rtBulletDot, { color: C.accent }]}>{num}.</Text>
          <Text style={s.rtBulletTxt}>{renderInline(content, s.rtBulletTxt)}</Text>
        </View>
      );
      return;
    }

    // Label: value
    if (/^[A-Z][^:]{1,30}:\s/.test(trimmed)) {
      const colonIdx = trimmed.indexOf(':');
      const label = trimmed.slice(0, colonIdx);
      const value = trimmed.slice(colonIdx + 1).trim();
      elements.push(
        <Text key={i} style={s.rtBody}>
          <Text style={{ fontWeight: '700', color: C.text }}>{label}: </Text>
          {renderInline(value, s.rtBody)}
        </Text>
      );
      return;
    }

    // Plain text
    elements.push(
      <Text key={i} style={s.rtBody}>
        {renderInline(trimmed, s.rtBody)}
      </Text>
    );
  });

  return <View>{elements}</View>;
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ item }) {
  if (item.role === 'system') {
    return (
      <View style={s.sysRow}>
        <View style={s.sysPill}>
          <Text style={s.sysTxt}>{item.text}</Text>
        </View>
      </View>
    );
  }

  const isUser = item.role === 'user';
  return (
    <View style={[s.bubRow, isUser ? s.bubRowUser : s.bubRowAI]}>
      {!isUser && (
        <View style={s.avatar}>
          <Text style={{ fontSize: 14 }}>🩺</Text>
        </View>
      )}
      <View style={[s.bub, isUser ? s.bubUser : s.bubAI]}>
        {isUser
          ? <Text style={s.bubTxtUser}>{item.text}</Text>
          : <RichText text={item.text} />
        }
        <Text style={[s.timeTxt, isUser ? s.timeTxtUser : s.timeTxtAI]}>
          {fmtTime(item.ts)}
        </Text>
      </View>
    </View>
  );
}

// ─── Typing indicator — used as ListFooterComponent ──────────────────────────

function TypingIndicator() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, { toValue: 1, duration: 260, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 260, useNativeDriver: true }),
          Animated.delay((dots.length - i) * 150),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={[s.bubRow, s.bubRowAI, { marginTop: 4, marginBottom: 8 }]}>
      <View style={s.avatar}>
        <Text style={{ fontSize: 14 }}>🩺</Text>
      </View>
      <View style={[s.bub, s.bubAI, { paddingVertical: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {dots.map((d, i) => (
            <Animated.View
              key={i}
              style={[
                s.typingDot,
                { marginRight: i < 2 ? 6 : 0 },
                {
                  opacity: d,
                  transform: [{
                    translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
                  }],
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Suggestion chips — 2×2 grid ─────────────────────────────────────────────

const CHIPS = [
  { emoji: '🩸', label: 'Abnormal results?' },
  { emoji: '💊', label: 'My prescriptions?' },
  { emoji: '📋', label: 'Full test summary' },
  { emoji: '🔬', label: 'Hemoglobin level?' },
];

function SuggestionChips({ onSelect }) {
  return (
    <View style={s.chipsWrap}>
      <Text style={s.chipHeading}>Suggested questions</Text>
      <View style={s.chipsGrid}>
        {CHIPS.map(({ emoji, label }, idx) => (
          <TouchableOpacity
            key={label}
            style={[s.chip, idx % 2 === 0 ? { marginRight: 8 } : {}]}
            onPress={() => onSelect(`${emoji} ${label}`)}
            activeOpacity={0.7}
          >
            <Text style={s.chipEmoji}>{emoji}</Text>
            <Text style={s.chipTxt}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Server config modal ──────────────────────────────────────────────────────

function ServerConfigModal({ visible, ip, port, onSave, onClose }) {
  const [localIp,   setLocalIp]   = useState(ip);
  const [localPort, setLocalPort] = useState(port);
  const [testing,   setTesting]   = useState(false);
  const [result,    setResult]    = useState(null);

  useEffect(() => {
    setLocalIp(ip); setLocalPort(port); setResult(null);
  }, [ip, port, visible]);

  async function test() {
    setTesting(true); setResult(null);
    try {
      const r = await fetch(`${buildUrl(localIp, localPort)}/health`);
      setResult(r.ok ? 'ok' : 'fail');
    } catch { setResult('fail'); }
    finally { setTesting(false); }
  }

  if (!visible) return null;

  return (
    <View style={s.overlay}>
      <View style={s.card}>
        <Text style={s.cardTitle}>⚙️  Server Settings</Text>
        <Text style={s.cardSub}>
          Enter your laptop's LAN IP address.{'\n'}Both devices must be on the same WiFi network.
        </Text>

        <Text style={s.fieldLabel}>Laptop IP Address</Text>
        <View style={s.fieldRow}>
          <Text style={s.fieldIcon}>🌐</Text>
          <TextInput
            style={s.fieldInput}
            value={localIp}
            onChangeText={setLocalIp}
            placeholder="e.g. 192.168.1.42"
            placeholderTextColor={C.placeholder}
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Text style={s.fieldLabel}>Port</Text>
        <View style={s.fieldRow}>
          <Text style={s.fieldIcon}>🔌</Text>
          <TextInput
            style={s.fieldInput}
            value={localPort}
            onChangeText={setLocalPort}
            placeholder="8001"
            placeholderTextColor={C.placeholder}
            keyboardType="numeric"
          />
        </View>

        <TouchableOpacity
          style={[s.testBtn, (testing || !localIp.trim()) && { opacity: 0.5 }]}
          onPress={test}
          disabled={testing || !localIp.trim()}
        >
          {testing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.testBtnTxt}>🔍  Test Connection</Text>
          }
        </TouchableOpacity>

        {result === 'ok'   && <Text style={[s.resultTxt, { color: C.green }]}>✅  Server reachable!</Text>}
        {result === 'fail' && <Text style={[s.resultTxt, { color: C.red  }]}>❌  Cannot connect — check IP and WiFi</Text>}

        <View style={{ flexDirection: 'row', marginTop: 6 }}>
          <TouchableOpacity style={[s.modalBtn, { marginRight: 10, borderWidth: 1, borderColor: C.borderDark }]} onPress={onClose}>
            <Text style={[s.modalBtnTxt, { color: C.textDim }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modalBtn, { backgroundColor: C.accent }, !localIp.trim() && { opacity: 0.4 }]}
            onPress={() => onSave(localIp, localPort)}
            disabled={!localIp.trim()}
          >
            <Text style={[s.modalBtnTxt, { color: '#fff' }]}>Save  ✓</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Document viewer modal ────────────────────────────────────────────────────

function DocViewerModal({ doc, chunks, onClose }) {
  if (!doc) return null;
  const docChunks = chunks.filter(c => c.docId === doc.id);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle} numberOfLines={1}>{doc.name}</Text>
            <Text style={s.statusLabel}>
              {doc.docType}  ·  {docChunks.length} chunks  ·  {fmtDate(doc.uploadedAt)}
            </Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={onClose}>
            <Text style={[s.iconBtnTxt, { color: C.red }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { icon: '🗂', label: 'Type',   value: doc.docType },
            { icon: '📦', label: 'Chunks', value: String(docChunks.length) },
            { icon: '🔍', label: 'OCR',    value: doc.ocrEngine || 'pdf' },
          ].map((item, idx) => (
            <View key={item.label} style={[s.statChip, idx < 2 && { marginRight: 8 }]}>
              <Text style={{ fontSize: 18 }}>{item.icon}</Text>
              <Text style={s.statLabel}>{item.label}</Text>
              <Text style={s.statValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        <ScrollView style={{ flex: 1, paddingHorizontal: 14 }} showsVerticalScrollIndicator={false}>
          <Text style={[s.sectionHead, { marginTop: 10, marginBottom: 8 }]}>📄  Extracted Text</Text>
          {docChunks.length === 0
            ? <Text style={s.emptyTxt}>No text extracted for this document.</Text>
            : docChunks.map((c, i) => (
                <View key={i} style={[s.chunkCard, { marginBottom: 10 }]}>
                  <Text style={s.chunkIdx}>Chunk {i + 1}</Text>
                  <Text style={s.chunkTxt}>{c.text}</Text>
                </View>
              ))
          }
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Document item ────────────────────────────────────────────────────────────

function DocItem({ doc, onView, onDelete }) {
  const icon = doc.docType === 'prescription' ? '💊'
             : doc.docType === 'lab_report'   ? '🧪' : '📄';
  return (
    <View style={[s.docItem, { marginBottom: 8 }]}>
      <View style={s.docIconWrap}><Text style={{ fontSize: 22 }}>{icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.docName} numberOfLines={1}>{doc.name}</Text>
        <Text style={s.docMeta}>{doc.chunkCount} chunks  ·  {fmtDate(doc.uploadedAt)}</Text>
      </View>
      <TouchableOpacity style={[s.docBtn, { marginRight: 6 }]} onPress={() => onView(doc)}>
        <Text style={s.docBtnTxt}>View</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.docBtn, { backgroundColor: '#fee2e2' }]} onPress={() => onDelete(doc)}>
        <Text style={[s.docBtnTxt, { color: C.red }]}>🗑</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Documents screen ─────────────────────────────────────────────────────────

function DocumentsScreen({ serverIp, serverPort, connected, docs, setDocs, allChunks, setAllChunks }) {
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const [viewDoc,   setViewDoc]   = useState(null);

  const baseUrl = buildUrl(serverIp, serverPort);

  async function handleUpload(type) {
    if (!serverIp) {
      Alert.alert('No server configured', 'Tap ⚙️ in the header to set the server IP.');
      return;
    }
    let uri, name, mimeType;
    try {
      if (type === 'image') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission denied', 'Camera roll access needed.'); return; }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9,
        });
        if (res.canceled) return;
        const asset = res.assets[0];
        uri = asset.uri; name = asset.fileName || `presc_${Date.now()}.jpg`; mimeType = asset.mimeType || 'image/jpeg';
      } else {
        const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
        if (res.canceled) return;
        const asset = res.assets[0];
        uri = asset.uri; name = asset.name; mimeType = 'application/pdf';
      }
    } catch (e) { Alert.alert('Picker error', String(e)); return; }

    setUploading(true); setProgress('⏳  Uploading & extracting text…'); setUploadMsg('');
    try {
      const form = new FormData();
      form.append('file', { uri, name, type: mimeType });
      const res = await fetch(`${baseUrl}/upload-and-embed/${PROFILE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: form,
      });
      if (!res.ok) throw new Error(`Server error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      if (data.status !== 'success') { setUploadMsg(`⚠️  ${data.reason || 'Upload failed'}`); return; }

      setProgress(`💾  Storing ${data.chunk_count} chunks locally…`);
      const docId  = genId();
      const newDoc = {
        id: docId, name: data.filename, docType: data.doc_type,
        chunkCount: data.chunk_count, uploadedAt: Date.now(), ocrEngine: data.ocr_engine,
      };
      const newChunks = data.chunks.map(c => ({
        docId, text: c.text, embedding: c.embedding, metadata: c.metadata,
      }));
      const updatedDocs   = [...docs, newDoc];
      const updatedChunks = [...allChunks, ...newChunks];
      setDocs(updatedDocs); setAllChunks(updatedChunks);
      await saveDocuments(updatedDocs); await saveAllChunks(updatedChunks);
      setUploadMsg(`✅  "${data.filename}" — ${data.chunk_count} chunks stored on device.`);
    } catch (e) {
      setUploadMsg(`❌  ${e.message}`);
    } finally { setUploading(false); setProgress(''); }
  }

  function handleDelete(doc) {
    Alert.alert('Delete Document', `Remove "${doc.name}" and its embeddings from this device?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          const updatedDocs   = docs.filter(d => d.id !== doc.id);
          const updatedChunks = allChunks.filter(c => c.docId !== doc.id);
          setDocs(updatedDocs); setAllChunks(updatedChunks);
          await saveDocuments(updatedDocs); await saveAllChunks(updatedChunks);
      }},
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Upload card */}
      <View style={s.uploadBox}>
        <Text style={s.sectionHead}>📤  Upload Documents</Text>
        <Text style={s.cardSub}>Indexed on server · stored as vectors on this device</Text>
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <TouchableOpacity
            style={[s.uploadBtn, { marginRight: 10 }, (!connected || uploading) && { opacity: 0.4 }]}
            onPress={() => handleUpload('pdf')}
            disabled={!connected || uploading}
          >
            <Text style={{ fontSize: 28 }}>📄</Text>
            <Text style={s.uploadBtnTxt}>PDF / Lab Report</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.uploadBtn, (!connected || uploading) && { opacity: 0.4 }]}
            onPress={() => handleUpload('image')}
            disabled={!connected || uploading}
          >
            <Text style={{ fontSize: 28 }}>💊</Text>
            <Text style={s.uploadBtnTxt}>Prescription Image</Text>
          </TouchableOpacity>
        </View>
        {uploading && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
            <ActivityIndicator color={C.accent} size="small" style={{ marginRight: 8 }} />
            <Text style={{ color: C.textDim, fontSize: 13 }}>{progress}</Text>
          </View>
        )}
        {!!uploadMsg && !uploading && (
          <Text style={[s.resultTxt, { marginTop: 10 },
            uploadMsg.startsWith('✅') ? { color: C.green } : { color: C.amber }]}>
            {uploadMsg}
          </Text>
        )}
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          { icon: '📂', label: 'Documents',    value: String(docs.length) },
          { icon: '🧩', label: 'Total Chunks', value: String(allChunks.length) },
          { icon: '📱', label: 'RAG',          value: 'On-Device', valueColor: C.accent },
        ].map((item, idx) => (
          <View key={item.label} style={[s.statChip, idx < 2 && { marginRight: 8 }]}>
            <Text style={{ fontSize: 18 }}>{item.icon}</Text>
            <Text style={s.statLabel}>{item.label}</Text>
            <Text style={[s.statValue, item.valueColor && { color: item.valueColor }]}>{item.value}</Text>
          </View>
        ))}
      </View>

      {docs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📂</Text>
          <Text style={{ color: C.textDim, fontSize: 15, fontWeight: '700', marginBottom: 6 }}>
            No documents yet
          </Text>
          <Text style={{ color: C.muted, fontSize: 13 }}>Upload a PDF or prescription image above</Text>
        </View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={d => d.id}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <DocItem doc={item} onView={setViewDoc} onDelete={handleDelete} />
          )}
        />
      )}

      <DocViewerModal doc={viewDoc} chunks={allChunks} onClose={() => setViewDoc(null)} />
    </View>
  );
}

// ─── Chat screen ──────────────────────────────────────────────────────────────

function ChatScreen({ serverIp, serverPort, connected, setConnected, allChunks, onOpenConfig }) {
  const [messages,  setMessages]  = useState([
    { id: genId(), role: 'system', text: '👋  Configure server IP (⚙️), then start chatting.', ts: Date.now() },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading,   setLoading]   = useState(false);
  const historyRef  = useRef([]);
  const listRef     = useRef(null);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages, loading]);

  function addMsg(role, text) {
    setMessages(prev => [...prev, { id: genId(), role, text, ts: Date.now() }]);
  }

  const handleSend = useCallback(async () => {
    const query = inputText.trim();
    if (!query || loading) return;
    if (!serverIp) { onOpenConfig(); return; }

    setInputText('');
    addMsg('user', query);
    setLoading(true);

    const baseUrl = buildUrl(serverIp, serverPort);
    const history = [...historyRef.current];

    try {
      let aiReply;
      let topChunks = [];
      if (allChunks.length > 0) {
        // Embed query locally then retrieve top-K chunks
        const embRes = await fetch(`${baseUrl}/embed-query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        if (!embRes.ok) throw new Error(`Embed failed: ${embRes.status}`);
        const { embedding: queryEmb } = await embRes.json();
        topChunks = retrieveTopK(queryEmb, allChunks, TOP_K);
      }
      // Always call POST /generate — server handles empty chunks gracefully
      const genRes = await fetch(`${baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, chunks: topChunks, history }),
      });
      if (!genRes.ok) throw new Error(`Generate failed (${genRes.status}): ${await genRes.text()}`);
      aiReply = (await genRes.json()).response;
      addMsg('assistant', aiReply || 'No response from server.');
      historyRef.current = [...history, query, aiReply].slice(-10);
      setConnected(true);
    } catch (e) {
      setConnected(false);
      addMsg('system', `❌  ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [inputText, loading, serverIp, serverPort, allChunks]);

  function clearChat() {
    Alert.alert('Clear Chat', 'Remove all messages from this session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {
          historyRef.current = [];
          setMessages([{ id: genId(), role: 'system', text: '🗑  Chat cleared.', ts: Date.now() }]);
      }},
    ]);
  }

  const showChips = messages.length <= 2 && !!serverIp;

  return (
    // Android: behavior must be undefined (not 'padding')
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* RAG status bar */}
      <View style={s.ragBar}>
        <Text style={s.ragBarTxt}>
          {allChunks.length > 0
            ? `🔍  On-device RAG  ·  ${allChunks.length} chunks`
            : '⚠️  No local chunks — using server RAG'}
        </Text>
        <TouchableOpacity onPress={clearChat}>
          <Text style={[s.ragBarTxt, { color: C.muted }]}>Clear 🗑</Text>
        </TouchableOpacity>
      </View>

      {/* Message list — typing indicator anchored as footer */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item }) => <ChatBubble item={item} />}
        contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={loading ? <TypingIndicator /> : null}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      {showChips && <SuggestionChips onSelect={q => setInputText(q)} />}

      {/* Input bar */}
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask about your health records…"
          placeholderTextColor={C.placeholder}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <Pressable
          style={({ pressed }) => [
            s.sendBtn,
            (!inputText.trim() || loading) && s.sendBtnOff,
            pressed && { opacity: 0.75 },
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.sendBtnTxt}>↑</Text>
          }
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab,        setTab]        = useState('chat');
  const [serverIp,   setServerIp]   = useState('');
  const [serverPort, setServerPort] = useState(DEFAULT_PORT);
  const [showConfig, setShowConfig] = useState(false);
  const [connected,  setConnected]  = useState(false);
  const [docs,       setDocs]       = useState([]);
  const [allChunks,  setAllChunks]  = useState([]);

  useEffect(() => {
    (async () => {
      const ip   = await AsyncStorage.getItem(KEY_SERVER_IP).catch(() => '') || '';
      const port = await AsyncStorage.getItem(KEY_SERVER_PORT).catch(() => '') || DEFAULT_PORT;
      const d    = await loadDocuments();
      const c    = await loadAllChunks();
      setServerIp(ip); setServerPort(port); setDocs(d); setAllChunks(c);
      if (!ip) setShowConfig(true);
    })();
  }, []);

  async function handleSaveConfig(ip, port) {
    const cleanIp   = ip.trim();
    const cleanPort = (port || DEFAULT_PORT).trim();
    setServerIp(cleanIp); setServerPort(cleanPort); setShowConfig(false);
    try { await AsyncStorage.setItem(KEY_SERVER_IP, cleanIp); await AsyncStorage.setItem(KEY_SERVER_PORT, cleanPort); } catch {}
    try { const r = await fetch(`${buildUrl(cleanIp, cleanPort)}/health`); setConnected(r.ok); }
    catch { setConnected(false); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ExpoStatusBar style="dark" backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>🩺  Health AI</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <View style={[s.statusDot, { backgroundColor: connected ? C.green : C.red, marginRight: 5 }]} />
            <Text style={s.statusLabel}>{connected ? 'Connected' : 'Not connected'}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setShowConfig(true)}
          style={[s.urlPill, !serverIp && { borderColor: C.amber }]}
        >
          <Text style={[s.urlPillTxt, !serverIp && { color: C.amber }]} numberOfLines={1}>
            {serverIp ? buildUrl(serverIp, serverPort) : '⚙  Set server IP'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={() => setShowConfig(true)}>
          <Text style={s.iconBtnTxt}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {[
          { key: 'chat',      label: '💬  Chat' },
          { key: 'documents', label: `📂  Docs${docs.length ? `  (${docs.length})` : ''}` },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[s.tabBtnTxt, tab === t.key && s.tabBtnTxtActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'chat' ? (
          <ChatScreen
            serverIp={serverIp} serverPort={serverPort}
            connected={connected} setConnected={setConnected}
            allChunks={allChunks} onOpenConfig={() => setShowConfig(true)}
          />
        ) : (
          <DocumentsScreen
            serverIp={serverIp} serverPort={serverPort} connected={connected}
            docs={docs} setDocs={setDocs}
            allChunks={allChunks} setAllChunks={setAllChunks}
          />
        )}
      </View>

      <ServerConfigModal
        visible={showConfig} ip={serverIp} port={serverPort}
        onSave={handleSaveConfig} onClose={() => setShowConfig(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Header
  header:          { flexDirection: 'row', alignItems: 'center',
                     paddingHorizontal: 14, paddingVertical: 10,
                     backgroundColor: C.headerBg,
                     borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:     { fontSize: 18, fontWeight: '800', color: C.text },
  statusDot:       { width: 7, height: 7, borderRadius: 4 },
  statusLabel:     { fontSize: 11, color: C.muted },
  urlPill:         { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                     borderWidth: 1, borderColor: C.borderDark,
                     backgroundColor: C.panelDeep, maxWidth: 170, marginRight: 6 },
  urlPillTxt:      { fontSize: 10, color: C.accent,
                     fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  iconBtn:         { padding: 6 },
  iconBtnTxt:      { fontSize: 18 },

  // Tab bar
  tabBar:          { flexDirection: 'row', backgroundColor: C.bgAlt,
                     borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:          { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive:    { borderBottomWidth: 2.5, borderBottomColor: C.tabActive },
  tabBtnTxt:       { fontSize: 13, color: C.muted, fontWeight: '500' },
  tabBtnTxtActive: { color: C.accent, fontWeight: '700' },

  // RAG bar
  ragBar:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                     paddingHorizontal: 14, paddingVertical: 7,
                     backgroundColor: C.accentPale,
                     borderBottomWidth: 1, borderBottomColor: C.border },
  ragBarTxt:       { fontSize: 11, color: C.accent, fontWeight: '600' },

  // System message
  sysRow:          { alignItems: 'center', marginVertical: 5 },
  sysPill:         { backgroundColor: C.panelDeep, borderRadius: 12,
                     paddingHorizontal: 14, paddingVertical: 5,
                     borderWidth: 1, borderColor: C.border },
  sysTxt:          { color: C.textDim, fontSize: 12, fontStyle: 'italic' },

  // Bubbles
  bubRow:          { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 3 },
  bubRowUser:      { justifyContent: 'flex-end' },
  bubRowAI:        { justifyContent: 'flex-start' },
  avatar:          { width: 32, height: 32, borderRadius: 16,
                     backgroundColor: C.panelDeep, borderWidth: 1, borderColor: C.borderDark,
                     alignItems: 'center', justifyContent: 'center',
                     marginRight: 8, marginBottom: 2 },
  bub:             { maxWidth: '80%', borderRadius: 18,
                     paddingHorizontal: 14, paddingVertical: 10,
                     elevation: 2, shadowColor: '#000',
                     shadowOffset: { width: 0, height: 1 },
                     shadowOpacity: 0.08, shadowRadius: 3 },
  bubUser:         { backgroundColor: C.userBub, borderBottomRightRadius: 4,
                     borderWidth: 1, borderColor: C.userBubBorder, marginLeft: 8 },
  bubAI:           { backgroundColor: C.aiBub, borderBottomLeftRadius: 4,
                     borderWidth: 1, borderColor: C.aiBubBorder },
  bubTxtUser:      { fontSize: 15, lineHeight: 22, color: '#fff' },
  timeTxt:         { fontSize: 10, marginTop: 5 },
  timeTxtUser:     { color: '#bbf7d0', textAlign: 'right' },
  timeTxtAI:       { color: C.muted },

  // Rich text
  rtHeader:        { fontWeight: '700', color: C.text, marginTop: 4, marginBottom: 2 },
  rtBody:          { fontSize: 14, lineHeight: 21, color: C.textDim },
  rtBulletRow:     { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 2 },
  rtBulletDot:     { fontSize: 14, color: C.accentLight, lineHeight: 21,
                     width: 18, fontWeight: '700' },
  rtBulletTxt:     { flex: 1, fontSize: 14, lineHeight: 21, color: C.textDim },
  rtDivider:       { height: 1, backgroundColor: C.border, marginVertical: 6 },

  // Typing dot
  typingDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accentLight },

  // Chips — 2-column grid
  chipsWrap:       { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 6 },
  chipHeading:     { fontSize: 11, color: C.muted, textTransform: 'uppercase',
                     letterSpacing: 0.8, marginBottom: 8, fontWeight: '600' },
  chipsGrid:       { flexDirection: 'row', flexWrap: 'wrap' },
  chip:            { width: '47%', flexDirection: 'row', alignItems: 'center',
                     backgroundColor: C.bgAlt, borderRadius: 12,
                     paddingHorizontal: 12, paddingVertical: 10,
                     borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  chipEmoji:       { fontSize: 16, marginRight: 7 },
  chipTxt:         { flex: 1, color: C.textDim, fontSize: 12, lineHeight: 17 },

  // Input row
  inputRow:        { flexDirection: 'row', alignItems: 'flex-end',
                     paddingHorizontal: 12, paddingVertical: 10,
                     backgroundColor: C.bgAlt,
                     borderTopWidth: 1, borderTopColor: C.border },
  input:           { flex: 1, minHeight: 42, maxHeight: 110,
                     backgroundColor: C.bg, borderRadius: 21,
                     paddingHorizontal: 16, paddingVertical: 10,
                     color: C.text, fontSize: 15,
                     borderWidth: 1, borderColor: C.borderDark,
                     marginRight: 8 },
  sendBtn:         { width: 42, height: 42, borderRadius: 21,
                     backgroundColor: C.accent,
                     alignItems: 'center', justifyContent: 'center' },
  sendBtnOff:      { backgroundColor: C.border },
  sendBtnTxt:      { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 26 },

  // Upload card
  uploadBox:       { margin: 14, padding: 16, backgroundColor: C.bgAlt,
                     borderRadius: 14, borderWidth: 1, borderColor: C.border },
  sectionHead:     { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 3 },
  cardSub:         { fontSize: 12, color: C.muted, lineHeight: 18 },
  uploadBtn:       { flex: 1, backgroundColor: C.panelDeep, borderRadius: 12,
                     borderWidth: 1, borderColor: C.borderDark,
                     padding: 14, alignItems: 'center' },
  uploadBtnTxt:    { color: C.textDim, fontSize: 12, fontWeight: '600',
                     textAlign: 'center', marginTop: 6 },

  // Stats row
  statsRow:        { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8 },
  statChip:        { flex: 1, backgroundColor: C.bgAlt, borderRadius: 10,
                     padding: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  statLabel:       { fontSize: 10, color: C.muted,
                     textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  statValue:       { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 2 },

  // Doc item
  docItem:         { flexDirection: 'row', alignItems: 'center',
                     backgroundColor: C.bgAlt, borderRadius: 12,
                     padding: 12, borderWidth: 1, borderColor: C.border },
  docIconWrap:     { width: 42, height: 42, borderRadius: 10,
                     backgroundColor: C.panelDeep, borderWidth: 1, borderColor: C.border,
                     alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  docName:         { fontSize: 14, fontWeight: '600', color: C.text },
  docMeta:         { fontSize: 11, color: C.muted, marginTop: 2 },
  docBtn:          { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
                     backgroundColor: C.accentPale, borderWidth: 1, borderColor: C.borderDark },
  docBtnTxt:       { color: C.accent, fontSize: 12, fontWeight: '700' },

  // Doc viewer
  chunkCard:       { backgroundColor: C.bgAlt, borderRadius: 10, padding: 12,
                     borderWidth: 1, borderColor: C.border },
  chunkIdx:        { fontSize: 11, color: C.accent, fontWeight: '600', marginBottom: 5 },
  chunkTxt:        { fontSize: 13, color: C.textDim, lineHeight: 20 },
  emptyTxt:        { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 20 },

  // Config modal
  overlay:         { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000088',
                     justifyContent: 'center', alignItems: 'center',
                     padding: 20, zIndex: 100 },
  card:            { backgroundColor: C.bgAlt, borderRadius: 20, padding: 24,
                     width: '100%', maxWidth: 400,
                     borderWidth: 1, borderColor: C.border },
  cardTitle:       { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 6 },
  cardSub:         { fontSize: 13, color: C.muted, marginBottom: 18, lineHeight: 19 },
  fieldLabel:      { fontSize: 11, fontWeight: '600', color: C.muted,
                     textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  fieldRow:        { flexDirection: 'row', alignItems: 'center',
                     backgroundColor: C.bg, borderRadius: 10,
                     paddingHorizontal: 12, borderWidth: 1,
                     borderColor: C.borderDark, marginBottom: 14 },
  fieldIcon:       { fontSize: 16, marginRight: 8 },
  fieldInput:      { flex: 1, paddingVertical: 12, color: C.text, fontSize: 15,
                     fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  testBtn:         { backgroundColor: C.accent, borderRadius: 10,
                     paddingVertical: 12, alignItems: 'center', marginBottom: 10 },
  testBtnTxt:      { color: '#fff', fontWeight: '700', fontSize: 14 },
  resultTxt:       { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  modalBtn:        { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
                     backgroundColor: C.bg },
  modalBtnTxt:     { fontWeight: '700', fontSize: 15 },
});
