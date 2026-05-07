// app/(tabs)/twin.tsx — Clinical Command Center
// Mode 1: Dashboard — vitals, organ scores, analytics, session history
// Mode 2: Log Routine — 7-tab full-detail event logger perfectly wired to BioGears
// FIX: Meal tab simplified — only Time of Meal + Add Meal (navigates to Nutrition)
// FIX: Clock drag fixed — uses pageX/pageY + clock layout measurement

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions,
  GestureResponderEvent,
  KeyboardAvoidingView, LayoutChangeEvent, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useBiogearsTwin } from '../../context/BiogearsTwinContext';
import { useTheme } from '../../context/ThemeContext';
import { colors as themeColors } from '../../theme/colors';
import Header from '../components/Header';
import CircadianClock from '../../components/twin/CircadianClock';
import QuickAddRow from '../../components/twin/QuickAddRow';
import BodyMap from '../../components/twin/BodyMap';

const { width: W } = Dimensions.get('window');

// ─── Storage keys ─────────────────────────────────────────────────────────────
const BIOGEARS_IP_KEY   = '@biogears_ip_address';
const BIOGEARS_PORT_KEY = '@biogears_port';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

function parseBP(bp: string | null | undefined) {
  if (!bp) return { sys: null, dia: null };
  const parts = bp.split('/');
  return { sys: parts[0] ? parseFloat(parts[0]) : null, dia: parts[1] ? parseFloat(parts[1]) : null };
}

function currentTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function wallTimeToLabel(wallTime: string): string {
  if (!wallTime) return '';
  const [h, m] = wallTime.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${pad(m)} ${ampm}`;
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function isValidIP(ip: string): boolean {
  const ipv4     = /^(\d{1,3}\.){3}\d{1,3}$/;
  const hostname = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})*$/;
  return ip === 'localhost' || ipv4.test(ip) || hostname.test(ip);
}

function isValidPort(port: string): boolean {
  const n = parseInt(port, 10);
  return !isNaN(n) && n >= 1 && n <= 65535;
}

// ─── Event / Dash tab types ───────────────────────────────────────────────────

type MealType = 'balanced' | 'high_carb' | 'high_protein' | 'fast_food' | 'ketogenic' | 'custom';
type EventTab = 'meal' | 'exercise' | 'sleep' | 'water' | 'substance' | 'stress' | 'other';
type DashTab  = 'overview' | 'organs' | 'trends';

const EVENT_TABS: { id: EventTab; label: string; icon: string; accent: string }[] = [
  { id: 'meal',      label: 'Meal',      icon: '🍽️', accent: '#f59e0b' },
  { id: 'exercise',  label: 'Exercise',  icon: '🏃', accent: '#10b981' },
  { id: 'sleep',     label: 'Sleep',     icon: '😴', accent: '#6366f1' },
  { id: 'water',     label: 'Water',     icon: '💧', accent: '#0ea5e9' },
  { id: 'substance', label: 'Substance', icon: '💊', accent: '#8b5cf6' },
  { id: 'stress',    label: 'Stress',    icon: '🧘', accent: '#ef4444' },
  { id: 'other',     label: 'Other',     icon: '⚡', accent: '#ec4899' },
];

type ConnectionStatus = 'unconfigured' | 'testing' | 'connected' | 'failed' | 'saved';

// ─── IP Config Modal ──────────────────────────────────────────────────────────

function IPConfigModal({
  visible, onClose, onSave, currentIP, currentPort, c,
}: {
  visible: boolean; onClose: () => void;
  onSave: (ip: string, port: string) => void;
  currentIP: string; currentPort: string; c: any;
}) {
  const [ip,         setIp]         = useState(currentIP);
  const [port,       setPort]       = useState(currentPort || '8080');
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [testMsg,    setTestMsg]    = useState('');

  useEffect(() => {
    if (visible) {
      setIp(currentIP); setPort(currentPort || '8080');
      setTestResult('idle'); setTestMsg('');
    }
  }, [visible, currentIP, currentPort]);

  const handleTest = async () => {
    if (!isValidIP(ip.trim())) { setTestResult('fail'); setTestMsg('Invalid IP address or hostname.'); return; }
    if (!isValidPort(port.trim())) { setTestResult('fail'); setTestMsg('Invalid port number (1–65535).'); return; }
    setTesting(true); setTestResult('idle'); setTestMsg('');
    try {
      const url = `http://${ip.trim()}:${port.trim()}/health`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        setTestResult('ok');
        setTestMsg(`Connected! BioGears engine at ${ip.trim()}:${port.trim()} is responding.`);
      } else {
        setTestResult('fail');
        setTestMsg(`Server responded with status ${res.status}. Check your BioGears REST API configuration.`);
      }
    } catch (e: any) {
      setTestResult('fail');
      setTestMsg(e.name === 'AbortError'
        ? 'Connection timed out. Check IP and that BioGears is running.'
        : `Could not reach server: ${e.message}`);
    } finally { setTesting(false); }
  };

  const handleSave = () => {
    if (!isValidIP(ip.trim())) { Alert.alert('Invalid IP', 'Please enter a valid IP address or hostname.'); return; }
    if (!isValidPort(port.trim())) { Alert.alert('Invalid Port', 'Please enter a valid port number (1–65535).'); return; }
    onSave(ip.trim(), port.trim());
  };

  const PRESETS = [
    { label: 'Localhost',   ip: 'localhost',   port: '8080' },
    { label: '192.168.1.x', ip: '192.168.1.',  port: '8080' },
    { label: '10.0.0.x',   ip: '10.0.0.',      port: '8080' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView style={ipStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[ipStyles.sheet, { backgroundColor: c.card }]}>
          <View style={ipStyles.headerRow}>
            <View style={ipStyles.headerLeft}>
              <View style={ipStyles.iconWrap}><Ionicons name="server" size={22} color="#38bdf8" /></View>
              <View>
                <Text style={[ipStyles.title, { color: c.text }]}>BioGears Connection</Text>
                <Text style={[ipStyles.subtitle, { color: c.sub }]}>Configure engine server address</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={ipStyles.closeBtn}>
              <Ionicons name="close" size={20} color={c.sub} />
            </TouchableOpacity>
          </View>

          <View style={[ipStyles.divider, { backgroundColor: c.border }]} />

          <Text style={[ipStyles.label, { color: c.sub }]}>QUICK PRESETS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {PRESETS.map(p => (
              <TouchableOpacity key={p.label}
                onPress={() => { setIp(p.ip); setPort(p.port); setTestResult('idle'); setTestMsg(''); }}
                style={[ipStyles.presetChip, { borderColor: c.border, backgroundColor: c.bg }]}>
                <Ionicons name="flash" size={12} color="#38bdf8" />
                <Text style={[ipStyles.presetTxt, { color: c.text }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[ipStyles.label, { color: c.sub }]}>IP ADDRESS / HOSTNAME</Text>
          <View style={[ipStyles.inputWrap, { backgroundColor: c.bg, borderColor: testResult === 'fail' ? '#ef4444' : testResult === 'ok' ? '#10b981' : c.border }]}>
            <Ionicons name="globe-outline" size={18} color="#38bdf8" style={{ marginRight: 10 }} />
            <TextInput style={[ipStyles.input, { color: c.text }]} value={ip}
              onChangeText={t => { setIp(t); setTestResult('idle'); setTestMsg(''); }}
              placeholder="e.g. 192.168.1.100 or localhost" placeholderTextColor={c.sub}
              autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            {ip.length > 0 && (
              <TouchableOpacity onPress={() => { setIp(''); setTestResult('idle'); setTestMsg(''); }}>
                <Ionicons name="close-circle" size={18} color={c.sub} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={[ipStyles.label, { color: c.sub, marginTop: 12 }]}>PORT</Text>
          <View style={[ipStyles.inputWrap, { backgroundColor: c.bg, borderColor: c.border }]}>
            <Ionicons name="git-network-outline" size={18} color="#38bdf8" style={{ marginRight: 10 }} />
            <TextInput style={[ipStyles.input, { color: c.text }]} value={port}
              onChangeText={t => { setPort(t); setTestResult('idle'); setTestMsg(''); }}
              placeholder="8080" placeholderTextColor={c.sub} keyboardType="number-pad" />
          </View>

          {ip.length > 0 && (
            <View style={[ipStyles.urlPreview, { backgroundColor: '#38bdf810', borderColor: '#38bdf830' }]}>
              <Ionicons name="link-outline" size={13} color="#38bdf8" />
              <Text style={ipStyles.urlTxt} numberOfLines={1}>http://{ip.trim() || '…'}:{port.trim() || '…'}/api</Text>
            </View>
          )}

          {testMsg.length > 0 && (
            <View style={[ipStyles.resultBox, { backgroundColor: testResult === 'ok' ? '#10b98115' : '#ef444415', borderColor: testResult === 'ok' ? '#10b98140' : '#ef444440' }]}>
              <Ionicons name={testResult === 'ok' ? 'checkmark-circle' : 'warning'} size={16} color={testResult === 'ok' ? '#10b981' : '#ef4444'} />
              <Text style={[ipStyles.resultTxt, { color: testResult === 'ok' ? '#10b981' : '#ef4444' }]}>{testMsg}</Text>
            </View>
          )}

          <View style={[ipStyles.infoBox, { backgroundColor: '#f59e0b10', borderColor: '#f59e0b30' }]}>
            <Ionicons name="information-circle-outline" size={14} color="#f59e0b" />
            <Text style={[ipStyles.infoTxt, { color: '#f59e0b' }]}>
              Ensure BioGears REST engine is running and reachable on the same network. Default port is 8080.
            </Text>
          </View>

          <View style={ipStyles.actionRow}>
            <TouchableOpacity onPress={handleTest} disabled={testing || ip.trim().length === 0}
              style={[ipStyles.testBtn, { borderColor: '#38bdf8', opacity: (testing || ip.trim().length === 0) ? 0.5 : 1 }]}>
              {testing ? <ActivityIndicator size="small" color="#38bdf8" /> : <Ionicons name="pulse" size={16} color="#38bdf8" />}
              <Text style={ipStyles.testBtnTxt}>{testing ? 'Testing…' : 'Test'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[ipStyles.saveBtn, { backgroundColor: '#38bdf8' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={ipStyles.saveBtnTxt}>Save & Connect</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ipStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap:   { width: 44, height: 44, borderRadius: 14, backgroundColor: '#38bdf815', borderWidth: 1, borderColor: '#38bdf840', justifyContent: 'center', alignItems: 'center' },
  title:      { fontSize: 17, fontWeight: '700' },
  subtitle:   { fontSize: 12, marginTop: 2 },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: '#33415520', justifyContent: 'center', alignItems: 'center' },
  divider:    { height: 1, marginBottom: 18 },
  label:      { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  presetChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  presetTxt:  { fontSize: 12, fontWeight: '600' },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12 },
  input:      { flex: 1, fontSize: 15, fontWeight: '500' },
  urlPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, marginTop: 10 },
  urlTxt:     { color: '#38bdf8', fontSize: 12, fontWeight: '500', flex: 1 },
  resultBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 12 },
  resultTxt:  { fontSize: 13, flex: 1, lineHeight: 18 },
  infoBox:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 12 },
  infoTxt:    { fontSize: 12, flex: 1, lineHeight: 17 },
  actionRow:  { flexDirection: 'row', gap: 10, marginTop: 20 },
  testBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 18, paddingVertical: 13 },
  testBtnTxt: { color: '#38bdf8', fontWeight: '700', fontSize: 14 },
  saveBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 13 },
  saveBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// ─── Connection Status Bar ────────────────────────────────────────────────────

function ConnectionBar({ ip, port, status, onPress, c }: {
  ip: string; port: string; status: ConnectionStatus; onPress: () => void; c: any;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'testing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  const dotColor  = status === 'connected' ? '#10b981' : status === 'failed' ? '#ef4444' : status === 'testing' ? '#f59e0b' : status === 'saved' ? '#38bdf8' : '#64748b';
  const label     = status === 'unconfigured' ? 'Tap to configure BioGears IP' : status === 'testing' ? 'Testing connection…' : status === 'connected' ? `Connected · ${ip}:${port}` : status === 'failed' ? `Unreachable · ${ip}:${port}` : `${ip}:${port}`;
  const bgColor   = status === 'connected' ? '#10b98115' : status === 'failed' ? '#ef444415' : status === 'unconfigured' ? '#f59e0b15' : '#38bdf810';
  const borderClr = status === 'connected' ? '#10b98140' : status === 'failed' ? '#ef444440' : status === 'unconfigured' ? '#f59e0b40' : '#38bdf840';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={[connBarStyles.bar, { backgroundColor: bgColor, borderColor: borderClr }]}>
      <Animated.View style={[connBarStyles.dot, { backgroundColor: dotColor, opacity: pulseAnim }]} />
      <Ionicons name="server-outline" size={13} color={dotColor} />
      <Text style={[connBarStyles.label, { color: dotColor }]} numberOfLines={1}>{label}</Text>
      <Ionicons name="settings-outline" size={13} color={dotColor} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

const connBarStyles = StyleSheet.create({
  bar:   { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  dot:   { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 12, fontWeight: '600', flex: 1 },
});

// ─── Simulation stepper ───────────────────────────────────────────────────────

const SIM_STEPS = ['Queue', 'Engine', 'Analyzing', 'Done'];

function SimStepper({ progress, status }: { progress: string; status: string }) {
  const stepIdx =
    status === 'queued'  ? 0
    : status === 'running' && progress.toLowerCase().includes('analy') ? 2
    : status === 'running' ? 1
    : status === 'done'  ? 3
    : 0;
  return (
    <View style={ss.stepperRow}>
      {SIM_STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <View style={ss.stepItem}>
            <View style={[ss.stepDot, i <= stepIdx && ss.stepDotActive]}>
              {i < stepIdx
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <Text style={ss.stepNum}>{i + 1}</Text>}
            </View>
            <Text style={[ss.stepLabel, i <= stepIdx && ss.stepLabelActive]}>{s}</Text>
          </View>
          {i < SIM_STEPS.length - 1 && <View style={[ss.stepLine, i < stepIdx && ss.stepLineActive]} />}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Clock Time Picker ────────────────────────────────────────────────────────
// FIX: Use pageX/pageY + clock layout to compute correct angle during drag

const CLOCK_SIZE = 260;
const CLOCK_R    = CLOCK_SIZE / 2;
const DOT_R      = 22;

function polarToXY(angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CLOCK_R + r * Math.cos(rad), y: CLOCK_R + r * Math.sin(rad) };
}

function xyToAngle(x: number, y: number): number {
  // x,y are relative to the center of the clock face
  let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
  if (angle < 0) angle += 360;
  return angle;
}

function angleToHour(angle: number): number {
  const h = Math.round(angle / 30) % 12;
  return h === 0 ? 12 : h;
}

function angleToMinute(angle: number): number {
  return Math.round(angle / 6) % 60;
}

type ClockMode = 'hour' | 'minute';

function ClockFace({
  mode, hour, minute, accent, onHourChange, onMinuteChange,
}: {
  mode: ClockMode; hour: number; minute: number; ampm: 'AM' | 'PM';
  accent: string; onHourChange: (h: number) => void; onMinuteChange: (m: number) => void;
}) {
  const clockRef    = useRef<View>(null);
  const clockLayout = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const currentAngle = mode === 'hour' ? ((hour % 12) / 12) * 360 : (minute / 60) * 360;

  // Single source of truth — drives BOTH the hand rotation AND the dot position
  const handAngle = useRef(new Animated.Value(currentAngle)).current;

  // Mirror of handAngle as plain state so the dot re-renders in sync
  const [dotAngle, setDotAngle] = useState(currentAngle);

  useEffect(() => {
    // Add a listener so dotAngle always matches the animated value
    const id = handAngle.addListener(({ value }) => setDotAngle(value));
    return () => handAngle.removeListener(id);
  }, [handAngle]);

  useEffect(() => {
    Animated.spring(handAngle, {
      toValue: currentAngle,
      useNativeDriver: false,
      tension: 120,
      friction: 8,
    }).start();
  }, [currentAngle]);

  const onLayout = useCallback((_e: LayoutChangeEvent) => {
    clockRef.current?.measureInWindow((px, py) => {
      clockLayout.current = { x: px, y: py };
    });
  }, []);

  const touchToAngle = useCallback((pageX: number, pageY: number): number => {
    const localX = pageX - clockLayout.current.x - CLOCK_R;
    const localY = pageY - clockLayout.current.y - CLOCK_R;
    return xyToAngle(localX, localY);
  }, []);

  const handleTouch = useCallback((evt: GestureResponderEvent) => {
    const { pageX, pageY } = evt.nativeEvent;
    const angle = touchToAngle(pageX, pageY);
    if (mode === 'hour') {
      const h = angleToHour(angle);
      const snapped = ((h % 12) / 12) * 360;
      handAngle.setValue(snapped);
      setDotAngle(snapped);
      onHourChange(h);
    } else {
      const m = angleToMinute(angle);
      const snapped = (m / 60) * 360;
      handAngle.setValue(snapped);
      setDotAngle(snapped);
      onMinuteChange(m);
    }
  }, [mode, touchToAngle, onHourChange, onMinuteChange]);

  const HOURS   = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

  // Dot always reads from dotAngle (synced listener) — never from currentAngle
  const handPos = polarToXY(dotAngle, CLOCK_R - 44);

  // Hand length: from center (CLOCK_R) up to where the dot circle center sits
  const HAND_R      = CLOCK_R - 44;          // radius of the dot circle center
  const HAND_LENGTH = HAND_R - DOT_R;         // stop the line at the dot edge
  const HAND_TOP    = CLOCK_R - HAND_LENGTH;  // top offset so bottom of hand = center

  return (
    <View
      ref={clockRef}
      onLayout={onLayout}
      style={[clockStyles.face, { width: CLOCK_SIZE, height: CLOCK_SIZE, borderRadius: CLOCK_R }]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleTouch}
      onResponderMove={handleTouch}
    >
      {/* Center pivot dot */}
      <View style={[clockStyles.centerDot, { backgroundColor: accent }]} />

      {/* Hand line — rotates around the center, stops just before the dot */}
      <Animated.View style={[clockStyles.hand, {
        backgroundColor: accent,
        height: HAND_LENGTH,
        top: HAND_TOP,
        left: CLOCK_R - 1,          // centered horizontally (1px wide)
        transform: [{
          rotate: handAngle.interpolate({
            inputRange: [0, 360],
            outputRange: ['0deg', '360deg'],
          }),
        }],
        transformOrigin: `1px ${HAND_LENGTH}px`, // pivot at bottom of line = clock center
      }]} />

      {/* End dot — position driven by dotAngle listener, always in sync */}
      <View style={[clockStyles.handEnd, {
        backgroundColor: accent,
        left: handPos.x - DOT_R,
        top:  handPos.y - DOT_R,
      }]} />

      {(mode === 'hour' ? HOURS : MINUTES).map((num, i) => {
        const angle      = i * 30;
        const pos        = polarToXY(angle, CLOCK_R - 44);
        const isSelected = mode === 'hour' ? num === hour : num === minute;
        return (
          <TouchableOpacity
            key={num}
            style={[clockStyles.numDot, {
              left: pos.x - DOT_R, top: pos.y - DOT_R,
              width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R,
              backgroundColor: isSelected ? accent : 'transparent',
            }]}
            onPress={() => {
              if (mode === 'hour') onHourChange(num);
              else onMinuteChange(num);
            }}
            activeOpacity={0.8}
          >
            <Text style={[clockStyles.numTxt, isSelected && { color: '#fff' }]}>
              {mode === 'minute' ? String(num).padStart(2, '0') : num}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TimePicker({ value, onChange, accent = '#38bdf8' }: {
  value: string; onChange: (t: string) => void; accent?: string;
}) {
  const [modalVisible, setModalVisible] = useState(false);

  const parseTime = (v: string) => {
    const [hStr, mStr] = (v || currentTime()).split(':');
    const h24 = parseInt(hStr, 10);
    const m   = parseInt(mStr, 10);
    const isPM = h24 >= 12;
    const h12  = h24 % 12 === 0 ? 12 : h24 % 12;
    return { hour: h12, minute: m, ampm: (isPM ? 'PM' : 'AM') as 'AM' | 'PM' };
  };

  const parsed = parseTime(value);
  const [hour,   setHour]   = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [ampm,   setAmpm]   = useState<'AM' | 'PM'>(parsed.ampm);
  const [mode,   setMode]   = useState<ClockMode>('hour');

  const openModal = () => {
    const p = parseTime(value);
    setHour(p.hour); setMinute(p.minute); setAmpm(p.ampm); setMode('hour');
    setModalVisible(true);
  };

  const confirm = () => {
    let h24 = hour % 12;
    if (ampm === 'PM') h24 += 12;
    onChange(`${pad(h24)}:${pad(minute)}`);
    setModalVisible(false);
  };

  const displayTime = () => {
    const p = parseTime(value);
    return `${p.hour}:${pad(p.minute)} ${p.ampm}`;
  };

  return (
    <>
      <TouchableOpacity onPress={openModal}
        style={[clockStyles.timeDisplay, { borderColor: accent + '60', backgroundColor: accent + '15' }]}
        activeOpacity={0.8}>
        <Text style={[clockStyles.timeDisplayTxt, { color: accent }]}>{displayTime()}</Text>
        <Ionicons name="time-outline" size={16} color={accent} />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={clockStyles.overlay}>
          <View style={clockStyles.sheet}>
            {/* Digital display row */}
            <View style={[clockStyles.digitalRow, { backgroundColor: '#1e293b' }]}>
              <TouchableOpacity onPress={() => setMode('hour')}>
                <Text style={[clockStyles.digitalNum, { color: mode === 'hour' ? accent : '#94a3b8' }]}>
                  {String(hour).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
              <Text style={[clockStyles.digitalColon, { color: accent }]}>:</Text>
              <TouchableOpacity onPress={() => setMode('minute')}>
                <Text style={[clockStyles.digitalNum, { color: mode === 'minute' ? accent : '#94a3b8' }]}>
                  {pad(minute)}
                </Text>
              </TouchableOpacity>
              <View style={clockStyles.ampmCol}>
                {(['AM', 'PM'] as const).map(period => (
                  <TouchableOpacity key={period} onPress={() => setAmpm(period)}
                    style={[clockStyles.ampmBtn, ampm === period && { backgroundColor: accent }]}>
                    <Text style={[clockStyles.ampmTxt, { color: ampm === period ? '#fff' : '#64748b' }]}>{period}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={clockStyles.modeLabel}>{mode === 'hour' ? 'SELECT HOUR' : 'SELECT MINUTE'}</Text>

            <View style={{ alignItems: 'center', marginVertical: 10 }}>
              <ClockFace
                mode={mode} hour={hour} minute={minute} ampm={ampm} accent={accent}
                onHourChange={(h) => { setHour(h); setTimeout(() => setMode('minute'), 120); }}
                onMinuteChange={setMinute}
              />
            </View>

            <View style={clockStyles.actions}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={clockStyles.cancelBtn}>
                <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 15 }}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirm} style={clockStyles.okBtn}>
                <Text style={[clockStyles.okTxt, { color: accent }]}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const clockStyles = StyleSheet.create({
  timeDisplay:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
  timeDisplayTxt: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet:          { width: '100%', maxWidth: 340, backgroundColor: '#0f172a', borderRadius: 28, overflow: 'hidden' },
  digitalRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 24, paddingVertical: 20 },
  digitalNum:     { fontSize: 56, fontWeight: '300', letterSpacing: -2, minWidth: 70, textAlign: 'center' },
  digitalColon:   { fontSize: 48, fontWeight: '300', marginHorizontal: 4, marginBottom: 8 },
  ampmCol:        { flexDirection: 'column', gap: 4, marginLeft: 12 },
  ampmBtn:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  ampmTxt:        { fontSize: 14, fontWeight: '700' },
  modeLabel:      { textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#475569', letterSpacing: 1.5, marginTop: 4 },
  face:           { backgroundColor: '#1e293b', position: 'relative' },
  centerDot:      { position: 'absolute', width: 10, height: 10, borderRadius: 5, left: CLOCK_R - 5, top: CLOCK_R - 5, zIndex: 10 },
  // hand: top/height/left are set inline; only static props here
  hand:           { position: 'absolute', width: 2, zIndex: 5 },
  handEnd:        { position: 'absolute', width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, zIndex: 6, alignItems: 'center', justifyContent: 'center' },
  numDot:         { position: 'absolute', alignItems: 'center', justifyContent: 'center', zIndex: 7 },
  numTxt:         { fontSize: 15, fontWeight: '600', color: '#cbd5e1' },
  actions:        { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 16, paddingTop: 8 },
  cancelBtn:      { paddingHorizontal: 16, paddingVertical: 10 },
  okBtn:          { paddingHorizontal: 16, paddingVertical: 10 },
  okTxt:          { fontWeight: '800', fontSize: 15 },
});

// ─── Reusable sub-components ──────────────────────────────────────────────────

function SectionLabel({ text, c }: { text: string; c: any }) {
  return <Text style={[ss.sectionLbl, { color: c.sub }]}>{text.toUpperCase()}</Text>;
}

function ChipRow<T extends string>({
  options, selected, onSelect, accent,
}: {
  options: { label: string; value: T }[];
  selected: T;
  onSelect: (v: T) => void;
  accent: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
      {options.map(opt => (
        <TouchableOpacity key={opt.value} onPress={() => onSelect(opt.value)}
          style={[ss.chip, selected === opt.value && { backgroundColor: accent, borderColor: accent }]}>
          <Text style={[ss.chipTxt, selected === opt.value && { color: '#fff' }]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function NumericInput({ value, onChange, placeholder, suffix, c }: {
  value: string; onChange: (v: string) => void; placeholder: string; suffix?: string; c: any;
}) {
  return (
    <View style={[ss.numRow, { backgroundColor: c.card, borderColor: c.border }]}>
      <TextInput style={[ss.numInput, { color: c.text }]} value={value} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor={c.sub} keyboardType="numeric" />
      {suffix ? <Text style={[ss.numSuffix, { color: c.sub }]}>{suffix}</Text> : null}
    </View>
  );
}

function SliderRow({ label, value, min, max, step, onChange, accent, c }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; accent: string; c: any;
}) {
  const pct = (value - min) / (max - min);
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={ss.rowBetween}>
        <Text style={[ss.sliderLabel, { color: c.sub }]}>{label}</Text>
        <Text style={[ss.sliderVal, { color: accent }]}>{value.toFixed(step < 1 ? 1 : 0)}</Text>
      </View>
      <View style={[ss.sliderTrack, { backgroundColor: c.border }]}>
        <View style={[ss.sliderFill, { width: `${pct * 100}%`, backgroundColor: accent }]} />
      </View>
      <View style={ss.sliderBtns}>
        <TouchableOpacity onPress={() => onChange(clamp(parseFloat((value - step).toFixed(2)), min, max))}
          style={[ss.sliderBtn, { borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>−</Text>
        </TouchableOpacity>
        <Text style={{ color: c.sub, fontSize: 11 }}>{min} → {max}</Text>
        <TouchableOpacity onPress={() => onChange(clamp(parseFloat((value + step).toFixed(2)), min, max))}
          style={[ss.sliderBtn, { borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AddButton({ label, accent, onPress }: { label: string; accent: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[ss.addBtn, { backgroundColor: accent }]} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name="add-circle" size={18} color="#fff" />
      <Text style={ss.addBtnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function TwinScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = themeColors[theme as 'light' | 'dark'] ?? themeColors['dark'];
  const insets = useSafeAreaInsets();

  const {
    twinStatus, simulationStatus, simulationProgress, simulationError,
    lastVitals, lastAnomalies, lastInteractionWarnings, lastAiInsights,
    todayEvents, addEvent, removeEvent, clearToday,
    savedRoutines, saveCurrentRoutine, loadRoutine, deleteRoutine,
    sessions, refreshSessions,
    simulationName, setSimulationName,
    runSimulation,
    organScores, cvdRisk, recoveryReadiness, healthScore,
    substances, refreshSubstances,
    undoLastSimulation,
    refreshAnalytics,
    todayMacros,
  } = useBiogearsTwin();

  // ── IP / Connection state ─────────────────────────────────────────────────
  const [biogearsIP,   setBiogearsIP]   = useState('');
  const [biogearsPort, setBiogearsPort] = useState('8080');
  const [connStatus,   setConnStatus]   = useState<ConnectionStatus>('unconfigured');
  const [showIPModal,  setShowIPModal]  = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const savedIP   = await AsyncStorage.getItem(BIOGEARS_IP_KEY);
        const savedPort = await AsyncStorage.getItem(BIOGEARS_PORT_KEY);
        if (savedIP) {
          setBiogearsIP(savedIP);
          setBiogearsPort(savedPort || '8080');
          setConnStatus('saved');
        } else {
          setShowIPModal(true);
        }
      } catch (_) {}
    })();
  }, []);

  const handleSaveIP = async (ip: string, port: string) => {
    try {
      await AsyncStorage.setItem(BIOGEARS_IP_KEY, ip);
      await AsyncStorage.setItem(BIOGEARS_PORT_KEY, port);
      setBiogearsIP(ip);
      setBiogearsPort(port);
      setConnStatus('testing');
      setShowIPModal(false);
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`http://${ip}:${port}/health`, { signal: controller.signal });
        clearTimeout(t);
        setConnStatus(res.ok ? 'connected' : 'failed');
      } catch { setConnStatus('failed'); }
    } catch { Alert.alert('Error', 'Could not save IP address.'); }
  };

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode,    setMode]    = useState<'dashboard' | 'routine'>('dashboard');
  const [dashTab, setDashTab] = useState<DashTab>('overview');
  const fabAnim = useRef(new Animated.Value(0)).current;

  const switchMode = (next: 'dashboard' | 'routine') => {
    Animated.spring(fabAnim, { toValue: next === 'routine' ? 1 : 0, useNativeDriver: true }).start();
    setMode(next);
  };

  // ── Active Tab ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<EventTab>('meal');
  const tabAccent = EVENT_TABS.find(t => t.id === activeTab)?.accent ?? '#38bdf8';

  // ── Times per tab ─────────────────────────────────────────────────────────
  const [mealTime,     setMealTime]     = useState(currentTime());
  const [exerciseTime, setExerciseTime] = useState(currentTime());
  const [sleepTime,    setSleepTime]    = useState(currentTime());
  const [waterTime,    setWaterTime]    = useState(currentTime());
  const [subTime,      setSubTime]      = useState(currentTime());
  const [stressTime,   setStressTime]   = useState(currentTime());
  const [otherTime,    setOtherTime]    = useState(currentTime());

  // ── Meal state (kept for addEvent compatibility) ──────────────────────────
  const [mealType] = useState<MealType>('balanced');

  // ── Exercise state ────────────────────────────────────────────────────────
  const EXERCISE_PRESETS = [
    { label: 'Walk', value: '0.2' }, { label: 'Easy Jog', value: '0.35' },
    { label: 'Run',  value: '0.55' }, { label: 'HIIT',    value: '0.75' },
    { label: 'Max',  value: '0.95' },
  ];
  const [exIntensity, setExIntensity] = useState(0.5);
  const [exDuration,  setExDuration]  = useState('30');

  // ── Sleep state ───────────────────────────────────────────────────────────
  const [sleepHours, setSleepHours] = useState(7.5);

  // ── Water state ───────────────────────────────────────────────────────────
  const [waterMl, setWaterMl] = useState('300');
  const WATER_QUICK = [150, 250, 300, 500, 750, 1000];

  // ── Substance state ───────────────────────────────────────────────────────
  const COMMON_SUBS = ['Caffeine', 'Ethanol', 'Aspirin', 'Acetaminophen', 'Morphine', 'Nicotine'];
  const [subName,       setSubName]       = useState('Caffeine');
  const [subSearch,     setSubSearch]     = useState('');
  const [subDose,       setSubDose]       = useState('200');
  const [showSubPicker, setShowSubPicker] = useState(false);

  const allSubNames = React.useMemo(() => {
    const fromBackend = Object.values(substances).flat().map((s: any) => typeof s === 'string' ? s : s.name);
    return [...new Set([...COMMON_SUBS, ...fromBackend])].sort();
  }, [substances]);

  const filteredSubs = subSearch.trim()
    ? allSubNames.filter(s => s.toLowerCase().includes(subSearch.toLowerCase()))
    : allSubNames;

  // ── Stress state ──────────────────────────────────────────────────────────
  const STRESS_PRESETS = [
    { label: 'Mild', value: 0.2 }, { label: 'Moderate', value: 0.5 },
    { label: 'High', value: 0.75 }, { label: 'Severe',  value: 1.0 },
  ];
  const [stressLevel, setStressLevel] = useState(0.3);
  const [stressDur,   setStressDur]   = useState('15');

  // ── Other state ───────────────────────────────────────────────────────────
  const [otherMode,     setOtherMode]   = useState<'alcohol' | 'fast'>('alcohol');
  const [alcoholDrinks, setAlcohol]     = useState('1');
  const [fastHours,     setFastHours]   = useState(16);

  // ── UI modals ─────────────────────────────────────────────────────────────
  const [saveRoutineModal, setSaveRoutineModal] = useState(false);
  const [routineName,      setRoutineName]      = useState('');
  const [simNameModal,     setSimNameModal]      = useState(false);
  const [pendingSimName,   setPendingSimName]    = useState('');

  useEffect(() => { refreshSubstances(); refreshSessions(); refreshAnalytics(); }, []);

  // ── addEvent handlers ─────────────────────────────────────────────────────

  // FIX: Meal tab now just navigates to Nutrition — no calorie entry here.
  // We log a minimal placeholder event so the queue shows something,
  // then immediately push to the nutrition screen.
  const handleGoToNutrition = () => {
    // Navigate to the nutrition tab
     router.push('/nutrition' as any);
  };

  const addExercise = () => {
    const dur = Math.max(1, parseInt(exDuration, 10) || 30) * 60;
    addEvent({
      event_type: 'exercise', value: exIntensity, wallTime: exerciseTime, duration_seconds: dur,
      displayLabel: `Exercise · ${Math.round(exIntensity * 100)}% intensity · ${exDuration}min`,
      displayIcon: '🏃',
    });
  };

  const addSleep = () => {
    const hours = clamp(sleepHours, 0.25, 12);
    addEvent({ event_type: 'sleep', value: hours, wallTime: sleepTime, displayLabel: `Sleep · ${hours}h`, displayIcon: '😴' });
  };

  const addWater = () => {
    const ml = parseFloat(waterMl);
    if (!ml || ml <= 0) return Alert.alert('Enter amount', 'Please enter how much water.');
    addEvent({ event_type: 'water', value: ml, wallTime: waterTime, displayLabel: `Water · ${ml} mL`, displayIcon: '💧' });
  };

  const addSubstance = () => {
    const dose = parseFloat(subDose);
    if (!subName) return Alert.alert('Select substance');
    if (!dose || dose <= 0) return Alert.alert('Enter dose', 'Please enter a dose.');
    addEvent({ event_type: 'substance', value: dose, wallTime: subTime, substance_name: subName, displayLabel: `${subName} · ${dose}`, displayIcon: '💊' });
  };

  const addStress = () => {
    const dur = Math.max(1, parseInt(stressDur, 10) || 15) * 60;
    addEvent({
      event_type: 'stress', value: stressLevel, wallTime: stressTime, duration_seconds: dur,
      displayLabel: `Stress · ${Math.round(stressLevel * 100)}% · ${stressDur}min`, displayIcon: '🧘',
    });
  };

  const addAlcohol = () => {
    const drinks = parseFloat(alcoholDrinks);
    if (!drinks || drinks <= 0) return Alert.alert('Enter drinks');
    addEvent({ event_type: 'alcohol', value: drinks, wallTime: otherTime, displayLabel: `Alcohol · ${drinks} standard drink${drinks !== 1 ? 's' : ''}`, displayIcon: '🍺' });
  };

  const addFast = () => {
    const hours = clamp(fastHours, 1, 48);
    addEvent({ event_type: 'fast', value: hours, wallTime: otherTime, displayLabel: `Fasting · ${hours}h`, displayIcon: '⏳' });
  };

  // ── Simulate ──────────────────────────────────────────────────────────────

  const handleSimulate = () => {
    if (todayEvents.length === 0) return Alert.alert('No Events', 'Log at least one event before simulating.');
    if (!biogearsIP) return Alert.alert('No IP Configured', 'Tap the connection bar to set the BioGears server address.', [
      { text: 'Configure', onPress: () => setShowIPModal(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
    if (twinStatus !== 'ready') return Alert.alert('Twin Not Ready', 'Complete your clinical profile first (Profile → Calibrate Twin).');
    setSimNameModal(true);
  };

  const startSimulation = async () => {
    setSimulationName(pendingSimName || `Sim ${new Date().toLocaleDateString('en-IN')}`);
    setPendingSimName('');
    setSimNameModal(false);
    switchMode('dashboard');
    setDashTab('overview');
    try { await runSimulation(); }
    catch (e: any) { console.warn('[Twin] Simulation error:', e.message); }
  };

  const handleLoadRoutine = (routineId: string, name: string) => {
    Alert.alert(`Load "${name}"`, 'Adds saved events to today\'s timeline.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Load', onPress: () => { loadRoutine(routineId); switchMode('routine'); } },
    ]);
  };

  const handleSaveRoutine = async () => {
    if (!routineName.trim()) return;
    await saveCurrentRoutine(routineName.trim());
    setRoutineName('');
    setSaveRoutineModal(false);
    Alert.alert('Routine Saved', `"${routineName}" saved with ${todayEvents.length} events.`);
  };

  const handleUndo = () => {
    Alert.alert('Undo Last Simulation', 'Revert twin engine to previous state?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo', style: 'destructive', onPress: async () => {
        try { await undoLastSimulation(); Alert.alert('Reverted', 'Engine state restored.'); }
        catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  // ────────────────────────────────────────────────────────────────────────────
  // TAB CONTENT
  // ────────────────────────────────────────────────────────────────────────────

  // FIX: Meal tab — ONLY time picker + navigate button. No calorie/macro inputs.
  const renderMealTab = () => (
    <View>
      {/* Info card explaining the flow */}
      <View style={[ss.mealInfoCard, { backgroundColor: '#f59e0b15', borderColor: '#f59e0b40' }]}>
        <Text style={ss.mealInfoEmoji}>🍽️</Text>
        <View style={{ flex: 1 }}>
          <Text style={[ss.mealInfoTitle, { color: '#f59e0b' }]}>Log meals in Nutrition</Text>
          <Text style={[ss.mealInfoSub, { color: '#f59e0b99' }]}>
            Use the Nutrition page to log your meals with full calorie &amp; macro tracking. They sync here automatically.
          </Text>
        </View>
      </View>

      <SectionLabel text="Time of Meal" c={c} />
      <View style={ss.timeRow}>
        <Ionicons name="time-outline" size={14} color={c.sub} />
        <Text style={[ss.timeLbl, { color: c.sub }]}>Eaten at</Text>
        <TimePicker value={mealTime} onChange={setMealTime} accent="#f59e0b" />
      </View>

      {/* CTA button → Nutrition page */}
      <TouchableOpacity
        style={[ss.addBtn, { backgroundColor: '#f59e0b' }]}
        onPress={handleGoToNutrition}
        activeOpacity={0.85}
      >
        <Ionicons name="restaurant" size={18} color="#fff" />
        <Text style={ss.addBtnTxt}>Go to Today's Meals</Text>
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
    </View>
  );

  const renderExerciseTab = () => (
    <View>
      <SectionLabel text="Exercise Intensity" c={c} />
      <View style={ss.rowCentered}>
        {EXERCISE_PRESETS.map(p => (
          <TouchableOpacity key={p.value} onPress={() => setExIntensity(parseFloat(p.value))}
            style={[ss.chipSm, Math.abs(exIntensity - parseFloat(p.value)) < 0.01 && { backgroundColor: '#10b981', borderColor: '#10b981' }]}>
            <Text style={[ss.chipTxt, Math.abs(exIntensity - parseFloat(p.value)) < 0.01 && { color: '#fff' }]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <SliderRow label={`Intensity: ${Math.round(exIntensity * 100)}% (${exIntensity <= 0.25 ? 'Light' : exIntensity <= 0.5 ? 'Moderate' : exIntensity <= 0.75 ? 'Vigorous' : 'Maximum'})`}
        value={exIntensity} min={0.05} max={1.0} step={0.05} onChange={setExIntensity} accent="#10b981" c={c} />
      <SectionLabel text="Duration" c={c} />
      <View style={ss.rowCentered}>
        {['10', '20', '30', '45', '60', '90'].map(m => (
          <TouchableOpacity key={m} onPress={() => setExDuration(m)}
            style={[ss.chipSm, exDuration === m && { backgroundColor: '#10b981', borderColor: '#10b981' }]}>
            <Text style={[ss.chipTxt, exDuration === m && { color: '#fff' }]}>{m}m</Text>
          </TouchableOpacity>
        ))}
      </View>
      <NumericInput value={exDuration} onChange={setExDuration} placeholder="Duration (min)" suffix="min" c={c} />
      <View style={[ss.infoBox, { backgroundColor: '#10b98115', borderColor: '#10b98140' }]}>
        <Ionicons name="flash" size={14} color="#10b981" />
        <Text style={{ color: '#10b981', fontSize: 12, flex: 1, marginLeft: 6 }}>
          BioGears simulates cardiac output, O₂ consumption, glucose burn &amp; exercise recovery in real-time.
        </Text>
      </View>
      <SectionLabel text="Occurred at" c={c} />
      <View style={ss.timeRow}>
        <Ionicons name="time-outline" size={14} color={c.sub} />
        <Text style={[ss.timeLbl, { color: c.sub }]}>Started at</Text>
        <TimePicker value={exerciseTime} onChange={setExerciseTime} accent="#10b981" />
      </View>
      <AddButton label="Add Exercise" accent="#10b981" onPress={addExercise} />
    </View>
  );

  const renderSleepTab = () => (
    <View>
      <SectionLabel text="Hours of Sleep" c={c} />
      <View style={[ss.bigDisplay, { borderColor: '#6366f140' }]}>
        <Text style={[ss.bigNum, { color: '#6366f1' }]}>{sleepHours.toFixed(1)}</Text>
        <Text style={[ss.bigUnit, { color: c.sub }]}>hours</Text>
      </View>
      <SliderRow label="Sleep duration" value={sleepHours} min={0.5} max={12} step={0.5} onChange={setSleepHours} accent="#6366f1" c={c} />
      <View style={ss.rowCentered}>
        {[4, 5, 6, 7, 7.5, 8, 9].map(h => (
          <TouchableOpacity key={h} onPress={() => setSleepHours(h)}
            style={[ss.chipSm, sleepHours === h && { backgroundColor: '#6366f1', borderColor: '#6366f1' }]}>
            <Text style={[ss.chipTxt, sleepHours === h && { color: '#fff' }]}>{h}h</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[ss.infoBox, { backgroundColor: '#6366f115', borderColor: '#6366f140', marginTop: 12 }]}>
        <Ionicons name="moon" size={14} color="#6366f1" />
        <Text style={{ color: '#6366f1', fontSize: 12, flex: 1, marginLeft: 6 }}>
          Sleep activates BioGears SleepData action — parasympathetic dominance, HR drops, glucose resets.
        </Text>
      </View>
      <SectionLabel text="Sleep start time" c={c} />
      <View style={ss.timeRow}>
        <Ionicons name="time-outline" size={14} color={c.sub} />
        <Text style={[ss.timeLbl, { color: c.sub }]}>Slept at</Text>
        <TimePicker value={sleepTime} onChange={setSleepTime} accent="#6366f1" />
      </View>
      <AddButton label="Log Sleep" accent="#6366f1" onPress={addSleep} />
    </View>
  );

  const renderWaterTab = () => (
    <View>
      <SectionLabel text="Amount" c={c} />
      <View style={[ss.bigDisplay, { borderColor: '#0ea5e940' }]}>
        <Text style={[ss.bigNum, { color: '#0ea5e9' }]}>{waterMl}</Text>
        <Text style={[ss.bigUnit, { color: c.sub }]}>mL</Text>
      </View>
      <SectionLabel text="Quick add" c={c} />
      <View style={ss.quickGrid}>
        {WATER_QUICK.map(ml => (
          <TouchableOpacity key={ml} onPress={() => setWaterMl(String(ml))}
            style={[ss.quickChip, waterMl === String(ml) && { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' }]}>
            <Text style={[ss.quickChipTxt, waterMl === String(ml) && { color: '#fff' }]}>{ml}mL</Text>
          </TouchableOpacity>
        ))}
      </View>
      <SectionLabel text="Custom amount" c={c} />
      <NumericInput value={waterMl} onChange={setWaterMl} placeholder="e.g. 350" suffix="mL" c={c} />
      <View style={[ss.infoBox, { backgroundColor: '#0ea5e915', borderColor: '#0ea5e940', marginTop: 4 }]}>
        <Ionicons name="water" size={14} color="#0ea5e9" />
        <Text style={{ color: '#0ea5e9', fontSize: 12, flex: 1, marginLeft: 6 }}>
          Modeled as ConsumeNutrientsData (Water). Affects blood volume, BP, and kidney function.
        </Text>
      </View>
      <SectionLabel text="Time" c={c} />
      <View style={ss.timeRow}>
        <Ionicons name="time-outline" size={14} color={c.sub} />
        <Text style={[ss.timeLbl, { color: c.sub }]}>Drank at</Text>
        <TimePicker value={waterTime} onChange={setWaterTime} accent="#0ea5e9" />
      </View>
      <AddButton label="Add Water" accent="#0ea5e9" onPress={addWater} />
    </View>
  );

  const renderSubstanceTab = () => (
    <View>
      <SectionLabel text="Substance" c={c} />
      <TouchableOpacity style={[ss.subSelector, { backgroundColor: c.card, borderColor: '#8b5cf6' }]} onPress={() => setShowSubPicker(true)}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#8b5cf6' }}>{subName}</Text>
        <Ionicons name="chevron-down" size={16} color="#8b5cf6" />
      </TouchableOpacity>
      <SectionLabel text="Common substances" c={c} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {['Caffeine', 'Aspirin', 'Acetaminophen', 'Ethanol', 'Albuterol', 'Morphine', 'Nicotine'].map(s => (
          <TouchableOpacity key={s}
            onPress={() => { setSubName(s); setSubDose(s === 'Caffeine' ? '200' : s === 'Ethanol' ? '14000' : '500'); }}
            style={[ss.chip, subName === s && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }]}>
            <Text style={[ss.chipTxt, subName === s && { color: '#fff' }]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <SectionLabel text="Dose" c={c} />
      <NumericInput value={subDose} onChange={setSubDose} placeholder="Amount" suffix="mg / mL" c={c} />
      <View style={[ss.infoBox, { backgroundColor: '#8b5cf615', borderColor: '#8b5cf640' }]}>
        <Ionicons name="medical" size={14} color="#8b5cf6" />
        <Text style={{ color: '#8b5cf6', fontSize: 12, flex: 1, marginLeft: 6 }}>
          79 substances supported. Oral (Caffeine, Aspirin), Nasal (Albuterol), IV Bolus, IV Compound. BioGears models full PK/PD kinetics.
        </Text>
      </View>
      <SectionLabel text="Time taken" c={c} />
      <View style={ss.timeRow}>
        <Ionicons name="time-outline" size={14} color={c.sub} />
        <Text style={[ss.timeLbl, { color: c.sub }]}>Taken at</Text>
        <TimePicker value={subTime} onChange={setSubTime} accent="#8b5cf6" />
      </View>
      <AddButton label="Add Substance" accent="#8b5cf6" onPress={addSubstance} />
    </View>
  );

  const renderStressTab = () => (
    <View>
      <SectionLabel text="Stress Level" c={c} />
      <View style={[ss.bigDisplay, { borderColor: '#ef444440' }]}>
        <Text style={[ss.bigNum, { color: '#ef4444' }]}>{Math.round(stressLevel * 100)}%</Text>
        <Text style={[ss.bigUnit, { color: c.sub }]}>
          {stressLevel <= 0.25 ? 'Mild' : stressLevel <= 0.5 ? 'Moderate' : stressLevel <= 0.75 ? 'High' : 'Severe'}
        </Text>
      </View>
      <View style={ss.rowCentered}>
        {STRESS_PRESETS.map(p => (
          <TouchableOpacity key={p.label} onPress={() => setStressLevel(p.value)}
            style={[ss.chipSm, Math.abs(stressLevel - p.value) < 0.01 && { backgroundColor: '#ef4444', borderColor: '#ef4444' }]}>
            <Text style={[ss.chipTxt, Math.abs(stressLevel - p.value) < 0.01 && { color: '#fff' }]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <SliderRow label="Intensity" value={stressLevel} min={0.05} max={1.0} step={0.05} onChange={setStressLevel} accent="#ef4444" c={c} />
      <SectionLabel text="Duration" c={c} />
      <View style={ss.rowCentered}>
        {['5', '10', '15', '20', '30', '60'].map(m => (
          <TouchableOpacity key={m} onPress={() => setStressDur(m)}
            style={[ss.chipSm, stressDur === m && { backgroundColor: '#ef4444', borderColor: '#ef4444' }]}>
            <Text style={[ss.chipTxt, stressDur === m && { color: '#fff' }]}>{m}m</Text>
          </TouchableOpacity>
        ))}
      </View>
      <NumericInput value={stressDur} onChange={setStressDur} placeholder="Duration (min)" suffix="min" c={c} />
      <View style={[ss.infoBox, { backgroundColor: '#ef444415', borderColor: '#ef444440', marginTop: 4 }]}>
        <Ionicons name="warning" size={14} color="#ef4444" />
        <Text style={{ color: '#ef4444', fontSize: 12, flex: 1, marginLeft: 6 }}>
          Modeled via PainStimulusData (sympathetic pathway). Raises HR, BP, glucose, and respiratory rate.
        </Text>
      </View>
      <SectionLabel text="Occurred at" c={c} />
      <View style={ss.timeRow}>
        <Ionicons name="time-outline" size={14} color={c.sub} />
        <Text style={[ss.timeLbl, { color: c.sub }]}>Started at</Text>
        <TimePicker value={stressTime} onChange={setStressTime} accent="#ef4444" />
      </View>
      <AddButton label="Add Stress Event" accent="#ef4444" onPress={addStress} />
    </View>
  );

  const renderOtherTab = () => (
    <View>
      <SectionLabel text="Event Type" c={c} />
      <View style={ss.modeSwitch}>
        {(['alcohol', 'fast'] as const).map(m => (
          <TouchableOpacity key={m} onPress={() => setOtherMode(m)}
            style={[ss.modeSwitchBtn, otherMode === m && { backgroundColor: '#ec4899' }]}>
            <Text style={[ss.modeSwitchTxt, otherMode === m && { color: '#fff' }]}>
              {m === 'alcohol' ? '🍺 Alcohol' : '⏳ Fasting'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {otherMode === 'alcohol' ? (
        <>
          <SectionLabel text="Standard Drinks" c={c} />
          <View style={[ss.bigDisplay, { borderColor: '#ec489940' }]}>
            <Text style={[ss.bigNum, { color: '#ec4899' }]}>{alcoholDrinks}</Text>
            <Text style={[ss.bigUnit, { color: c.sub }]}>drinks (1 = 14g ethanol)</Text>
          </View>
          <View style={ss.rowCentered}>
            {['0.5', '1', '2', '3', '4', '6'].map(n => (
              <TouchableOpacity key={n} onPress={() => setAlcohol(n)}
                style={[ss.chipSm, alcoholDrinks === n && { backgroundColor: '#ec4899', borderColor: '#ec4899' }]}>
                <Text style={[ss.chipTxt, alcoholDrinks === n && { color: '#fff' }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <NumericInput value={alcoholDrinks} onChange={setAlcohol} placeholder="Number of drinks" suffix="drinks" c={c} />
          <View style={[ss.infoBox, { backgroundColor: '#ec489915', borderColor: '#ec489940' }]}>
            <Ionicons name="wine" size={14} color="#ec4899" />
            <Text style={{ color: '#ec4899', fontSize: 12, flex: 1, marginLeft: 6 }}>
              1 standard drink = 14g ethanol. BioGears oral ethanol action — vasodilation, mild bradycardia, impaired glucose.
            </Text>
          </View>
          <SectionLabel text="Time" c={c} />
          <View style={ss.timeRow}>
            <Ionicons name="time-outline" size={14} color={c.sub} />
            <Text style={[ss.timeLbl, { color: c.sub }]}>Consumed at</Text>
            <TimePicker value={otherTime} onChange={setOtherTime} accent="#ec4899" />
          </View>
          <AddButton label="Log Alcohol" accent="#ec4899" onPress={addAlcohol} />
        </>
      ) : (
        <>
          <SectionLabel text="Fasting Duration" c={c} />
          <View style={[ss.bigDisplay, { borderColor: '#ec489940' }]}>
            <Text style={[ss.bigNum, { color: '#ec4899' }]}>{fastHours}</Text>
            <Text style={[ss.bigUnit, { color: c.sub }]}>hours</Text>
          </View>
          <SliderRow label="Fasting hours" value={fastHours} min={1} max={48} step={1} onChange={setFastHours} accent="#ec4899" c={c} />
          <View style={ss.rowCentered}>
            {[8, 12, 14, 16, 18, 24, 36, 48].map(h => (
              <TouchableOpacity key={h} onPress={() => setFastHours(h)}
                style={[ss.chipSm, fastHours === h && { backgroundColor: '#ec4899', borderColor: '#ec4899' }]}>
                <Text style={[ss.chipTxt, fastHours === h && { color: '#fff' }]}>{h}h</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[ss.infoBox, { backgroundColor: '#ec489915', borderColor: '#ec489940', marginTop: 8 }]}>
            <Ionicons name="timer" size={14} color="#ec4899" />
            <Text style={{ color: '#ec4899', fontSize: 12, flex: 1, marginLeft: 6 }}>
              BioGears advances time with zero nutrition. Glucose drops, ketones rise, mild sympathetic activation.
            </Text>
          </View>
          <SectionLabel text="Fast start time" c={c} />
          <View style={ss.timeRow}>
            <Ionicons name="time-outline" size={14} color={c.sub} />
            <Text style={[ss.timeLbl, { color: c.sub }]}>Started at</Text>
            <TimePicker value={otherTime} onChange={setOtherTime} accent="#ec4899" />
          </View>
          <AddButton label="Log Fasting Period" accent="#ec4899" onPress={addFast} />
        </>
      )}
    </View>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'meal':      return renderMealTab();
      case 'exercise':  return renderExerciseTab();
      case 'sleep':     return renderSleepTab();
      case 'water':     return renderWaterTab();
      case 'substance': return renderSubstanceTab();
      case 'stress':    return renderStressTab();
      case 'other':     return renderOtherTab();
      default:          return null;
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ────────────────────────────────────────────────────────────────────────────

  const renderOverviewTab = () => {
    const v  = lastVitals;
    const bp = parseBP(v?.blood_pressure);
    const vStatus = (val: number | null | undefined, lo: number, hi: number) =>
      val == null ? null : val < lo ? '#f59e0b' : val > hi ? '#ef4444' : '#10b981';

    return (
      <>
        {simulationStatus === 'failed' && (
          <View style={[ss.errorBox, { backgroundColor: '#ef444420' }]}>
            <Ionicons name="warning" size={18} color="#ef4444" />
            <Text style={ss.errorTxt}>{simulationError || 'Simulation failed — check server logs.'}</Text>
          </View>
        )}
        {lastInteractionWarnings.length > 0 && (
          <View style={ss.interactionBanner}>
            <Ionicons name="medical" size={16} color="#fbbf24" />
            <Text style={ss.interactionTxt}>{lastInteractionWarnings[0]}</Text>
          </View>
        )}

        <CircadianClock />

        {healthScore && (
          <LinearGradient
            colors={healthScore.grade === 'A' ? ['#10b981','#059669'] : healthScore.grade === 'B' ? ['#38bdf8','#0284c7'] : healthScore.grade === 'C' ? ['#f59e0b','#d97706'] : ['#ef4444','#dc2626']}
            style={ss.scoreBadge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View>
              <Text style={ss.scoreLetter}>{healthScore.grade}</Text>
              <Text style={ss.scoreLabel}>{healthScore.label}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={ss.scoreNum}>{healthScore.score}</Text>
              <Text style={ss.scoreSubLabel}>/ 100</Text>
            </View>
          </LinearGradient>
        )}

        <QuickAddRow addEvent={addEvent} />

        <Text style={[ss.section, { color: c.text }]}>Simulation Vitals</Text>
        {v ? (
          <View style={ss.vitalsGrid}>
            {[
              { label: 'Heart Rate',   val: v.heart_rate   ? Math.round(v.heart_rate)   : null, unit: 'bpm',    icon: '🫀', color: '#ef4444', lo: 60,   hi: 100  },
              { label: 'Systolic BP',  val: bp.sys         ? Math.round(bp.sys!)         : null, unit: 'mmHg',   icon: '🩸', color: '#f59e0b', lo: 90,   hi: 120  },
              { label: 'Diastolic BP', val: bp.dia         ? Math.round(bp.dia!)         : null, unit: 'mmHg',   icon: '🩸', color: '#f97316', lo: 60,   hi: 80   },
              { label: 'Glucose',      val: v.glucose      ? Math.round(v.glucose)       : null, unit: 'mg/dL',  icon: '🍬', color: '#6366f1', lo: 70,   hi: 140  },
              { label: 'SpO₂',         val: v.spo2         ? Math.round(v.spo2)          : null, unit: '%',      icon: '🫁', color: '#38bdf8', lo: 94,   hi: 100  },
              { label: 'Resp. Rate',   val: v.respiration  ? Math.round(v.respiration)   : null, unit: 'br/min', icon: '💨', color: '#10b981', lo: 12,   hi: 20   },
              ...(v.map             != null ? [{ label: 'MAP',       val: Math.round(v.map!),                            unit: 'mmHg', icon: '📈', color: '#a78bfa', lo: 70,   hi: 100  }] : []),
              ...(v.core_temperature != null ? [{ label: 'Core Temp', val: Number((v.core_temperature!).toFixed(1)),    unit: '°C',   icon: '🌡️', color: '#fb923c', lo: 36.5, hi: 37.5 }] : []),
            ].map(({ label, val, unit, icon, color, lo, hi }) => {
              const dot = vStatus(val, lo, hi);
              return (
                <View key={label} style={[ss.vitalCard, { borderColor: color + '40', backgroundColor: c.card }]}>
                  <View style={ss.vitalTopRow}>
                    <Text style={ss.vitalIcon}>{icon}</Text>
                    {dot && <View style={[ss.statusDot, { backgroundColor: dot }]} />}
                  </View>
                  <Text style={[ss.vitalValue, { color }]}>{val ?? '—'}</Text>
                  <Text style={[ss.vitalUnit, { color: c.sub }]}>{unit}</Text>
                  <Text style={[ss.vitalLabel, { color: c.sub }]}>{label}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[ss.emptyCard, { backgroundColor: c.card }]}>
            <Text style={{ fontSize: 40 }}>🔬</Text>
            <Text style={[ss.emptyTitle, { color: c.text }]}>No Simulation Yet</Text>
            <Text style={[ss.emptySub, { color: c.sub }]}>Tap + to log your routine and run a simulation</Text>
          </View>
        )}

        {lastAiInsights.length > 0 && (
          <>
            <Text style={[ss.section, { color: c.text }]}>AI Insights</Text>
            {lastAiInsights.map((ins, i) => (
              <View key={i} style={[ss.insightPill, { backgroundColor: c.card }]}>
                <Text style={{ color: c.text, fontSize: 13, lineHeight: 18 }}>{ins}</Text>
              </View>
            ))}
          </>
        )}

        {todayMacros.calories > 0 && (
          <>
            <Text style={[ss.section, { color: c.text }]}>Today's Nutrition</Text>
            <View style={[ss.macroRingsCard, { backgroundColor: c.card }]}>
              <View style={ss.macroRingWrap}>
                <View style={[ss.macroOuterRing, { borderColor: '#f59e0b40', width: 100, height: 100, borderRadius: 50 }]}>
                  <View style={[ss.macroInnerRing, { backgroundColor: c.card, width: 72, height: 72, borderRadius: 36 }]}>
                    <Text style={[ss.macroRingVal, { color: '#f59e0b' }]}>{Math.round(todayMacros.calories)}</Text>
                    <Text style={[ss.macroRingUnit, { color: c.sub }]}>kcal</Text>
                  </View>
                </View>
                <Text style={[ss.macroRingLabel, { color: c.sub }]}>Calories</Text>
              </View>
              {[
                { label: 'Carbs',   val: todayMacros.carbs,   color: '#f59e0b', target: 250 },
                { label: 'Protein', val: todayMacros.protein, color: '#10b981', target: 60  },
                { label: 'Fat',     val: todayMacros.fat,     color: '#ef4444', target: 65  },
              ].map(m => {
                const pct = Math.min(m.val / m.target, 1);
                return (
                  <View key={m.label} style={ss.macroRingWrap}>
                    <View style={[ss.macroOuterRing, { borderColor: m.color + '40', width: 76, height: 76, borderRadius: 38 }]}>
                      <View style={[ss.macroInnerRing, { backgroundColor: c.card, width: 54, height: 54, borderRadius: 27 }]}>
                        <Text style={[ss.macroRingVal, { color: m.color, fontSize: 14 }]}>{Math.round(m.val)}g</Text>
                        <Text style={[ss.macroRingUnit, { color: c.sub }]}>{Math.round(pct * 100)}%</Text>
                      </View>
                    </View>
                    <Text style={[ss.macroRingLabel, { color: c.sub }]}>{m.label}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {(cvdRisk || recoveryReadiness) && (
          <View style={ss.row}>
            {cvdRisk && (
              <View style={[ss.analyticsCard, { backgroundColor: c.card, flex: 1, marginRight: 8 }]}>
                <Text style={[ss.analyticsTitle, { color: c.sub }]}>CVD Risk (10yr)</Text>
                <Text style={[ss.analyticsValue, { color: cvdRisk.color }]}>{cvdRisk.ten_year_risk_pct}%</Text>
                <Text style={[ss.analyticsLabel, { color: c.sub }]}>{cvdRisk.category}</Text>
              </View>
            )}
            {recoveryReadiness && (
              <View style={[ss.analyticsCard, { backgroundColor: c.card, flex: 1 }]}>
                <Text style={[ss.analyticsTitle, { color: c.sub }]}>Recovery</Text>
                <Text style={[ss.analyticsValue, { color: recoveryReadiness.status === 'Ready' ? '#10b981' : '#f59e0b' }]}>
                  {recoveryReadiness.readiness_score}
                </Text>
                <Text style={[ss.analyticsLabel, { color: c.sub }]}>{recoveryReadiness.status}</Text>
              </View>
            )}
          </View>
        )}
      </>
    );
  };

  const renderOrgansTab = () => (
    <>
      {organScores?.scores ? (
        <>
          <BodyMap scores={organScores.scores} c={c} />
          <Text style={[ss.section, { color: c.text }]}>Scores Breakdown</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(Object.keys(organScores.scores) as string[]).map(name => {
              const data = organScores.scores[name];
              const clr  = data.status === 'critical' ? '#ef4444' : data.status === 'warning' ? '#f59e0b' : '#10b981';
              const icons: Record<string, string> = { heart: '🫀', lungs: '🫁', gut: '🦠', brain: '🧠', liver: '🟤', legs: '🦵' };
              return (
                <View key={name} style={[ss.organCard, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Text style={{ fontSize: 24 }}>{icons[name] ?? '🔬'}</Text>
                  <Text style={[ss.organScore, { color: clr }]}>{data.score}%</Text>
                  <Text style={[ss.organName, { color: c.sub }]}>{name.charAt(0).toUpperCase() + name.slice(1)}</Text>
                  <View style={[ss.organBar, { backgroundColor: c.border }]}>
                    <View style={[ss.organBarFill, { width: `${data.score}%`, backgroundColor: clr }]} />
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </>
      ) : (
        <View style={[ss.emptyCard, { backgroundColor: c.card }]}>
          <Text style={{ fontSize: 40 }}>🏥</Text>
          <Text style={[ss.emptyTitle, { color: c.text }]}>No Organ Data Yet</Text>
          <Text style={[ss.emptySub, { color: c.sub }]}>Run a simulation to see organ health scores</Text>
        </View>
      )}
    </>
  );

  const renderTrendsTab = () => (
    <>
      {savedRoutines.length > 0 && (
        <>
          <Text style={[ss.section, { color: c.text }]}>Saved Routines</Text>
          {savedRoutines.map(r => (
            <TouchableOpacity key={r.id} style={[ss.routineCard, { backgroundColor: c.card }]}
              onPress={() => handleLoadRoutine(r.id, r.name)}
              onLongPress={() => Alert.alert('Delete', `Delete "${r.name}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteRoutine(r.id) },
              ])}>
              <View style={ss.routineIcon}><Text style={{ fontSize: 20 }}>📋</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[ss.routineName, { color: c.text }]}>{r.name}</Text>
                <Text style={[ss.routineMeta, { color: c.sub }]}>{r.eventCount} events · {new Date(r.createdAt).toLocaleDateString('en-IN')}</Text>
              </View>
              <Ionicons name="play-circle" size={28} color={c.active} />
            </TouchableOpacity>
          ))}
        </>
      )}

      {sessions.length > 0 ? (
        <>
          <View style={ss.rowBetween}>
            <Text style={[ss.section, { color: c.text }]}>Recent Simulations</Text>
            <TouchableOpacity onPress={handleUndo}>
              <Text style={{ color: '#ef4444', fontSize: 12 }}>⏪ Undo Last</Text>
            </TouchableOpacity>
          </View>
          {sessions.slice(0, 5).map(s => (
            <TouchableOpacity key={s.session_id} style={[ss.sessionCard, { backgroundColor: c.card }]}
              onPress={() => router.push(`/session/${s.session_id}`)}>
              <View style={[ss.sessionDot, { backgroundColor: s.has_anomaly ? '#ef444420' : '#10b98120' }]}>
                <Ionicons name={s.has_anomaly ? 'warning' : 'checkmark-circle'} size={22} color={s.has_anomaly ? '#ef4444' : '#10b981'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ss.sessionName, { color: c.text }]}>{s.name || 'Simulation'}</Text>
                <Text style={[ss.sessionMeta, { color: c.sub }]}>
                  {s.timestamp ? new Date(s.timestamp).toLocaleDateString('en-IN') : 'Recent'} · {s.event_count ?? 0} events
                </Text>
                {s.ai_insights?.[0] && (
                  <Text style={[ss.sessionInsight, { color: c.sub }]} numberOfLines={1}>{s.ai_insights[0]}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.sub} />
            </TouchableOpacity>
          ))}
        </>
      ) : (
        <View style={[ss.emptyCard, { backgroundColor: c.card }]}>
          <Text style={{ fontSize: 40 }}>📈</Text>
          <Text style={[ss.emptyTitle, { color: c.text }]}>No History Yet</Text>
          <Text style={[ss.emptySub, { color: c.sub }]}>Completed simulations will appear here</Text>
        </View>
      )}
    </>
  );

  const renderDashboard = () => {
    const DASH_TABS: { id: DashTab; label: string; icon: string }[] = [
      { id: 'overview', label: 'Overview', icon: '📊' },
      { id: 'organs',   label: 'Organs',   icon: '🏥' },
      { id: 'trends',   label: 'Trends',   icon: '📈' },
    ];
    return (
      <ScrollView style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 62, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}>
        <View style={[ss.dashTabBar, { borderBottomColor: c.border }]}>
          {DASH_TABS.map(t => {
            const active = dashTab === t.id;
            return (
              <TouchableOpacity key={t.id} style={ss.dashTabBtn} onPress={() => setDashTab(t.id)}>
                <Text style={ss.dashTabIcon}>{t.icon}</Text>
                <Text style={[ss.dashTabLabel, { color: active ? c.active : c.sub, borderBottomWidth: active ? 2.5 : 0, borderBottomColor: c.active }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {dashTab === 'overview' && renderOverviewTab()}
        {dashTab === 'organs'   && renderOrgansTab()}
        {dashTab === 'trends'   && renderTrendsTab()}
      </ScrollView>
    );
  };

  // ────────────────────────────────────────────────────────────────────────────
  // ROUTINE PANEL
  // ────────────────────────────────────────────────────────────────────────────

  const renderRoutinePanel = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 62, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}>

        <ConnectionBar ip={biogearsIP} port={biogearsPort} status={connStatus} onPress={() => setShowIPModal(true)} c={c} />

        {todayEvents.length > 0 && (
          <View style={[ss.eventBanner, { backgroundColor: tabAccent + '18', borderColor: tabAccent + '40' }]}>
            <Ionicons name="list" size={14} color={tabAccent} />
            <Text style={[ss.eventBannerTxt, { color: tabAccent }]}>
              {todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''} queued for simulation
            </Text>
            <TouchableOpacity onPress={handleSimulate} style={[ss.simBadgeBtn, { backgroundColor: tabAccent }]}>
              <Ionicons name="flash" size={12} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginLeft: 3 }}>Run</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={[ss.tabBar, { borderBottomColor: c.border }]}
          contentContainerStyle={{ paddingHorizontal: 12 }}>
          {EVENT_TABS.map(t => {
            const active = activeTab === t.id;
            return (
              <TouchableOpacity key={t.id} onPress={() => setActiveTab(t.id)}
                style={[ss.tabBtn, active && { borderBottomWidth: 2.5, borderBottomColor: t.accent }]}>
                <Text style={{ fontSize: 20 }}>{t.icon}</Text>
                <Text style={[ss.tabBtnLabel, { color: active ? t.accent : c.sub }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={[ss.tabPanel, { backgroundColor: c.card, marginHorizontal: 12, borderColor: c.border }]}>
          {renderTabContent()}
        </View>

        {todayEvents.length > 0 && (
          <View style={{ paddingHorizontal: 12 }}>
            <View style={[ss.rowBetween, { marginTop: 20, marginBottom: 10 }]}>
              <Text style={[ss.section, { color: c.text, marginTop: 0 }]}>Today's Queue ({todayEvents.length})</Text>
              <TouchableOpacity onPress={() => Alert.alert('Clear All', 'Remove all queued events?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearToday },
              ])}>
                <Text style={{ color: '#ef4444', fontSize: 12 }}>Clear All</Text>
              </TouchableOpacity>
            </View>
            {todayEvents.map(ev => {
              const tabInfo = EVENT_TABS.find(t => t.id === ev.event_type) || { accent: '#64748b' };
              return (
                <View key={ev.id} style={[ss.timelineRow, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={[ss.timelineLine, { backgroundColor: tabInfo.accent }]} />
                  <View style={[ss.timelineDot, { backgroundColor: tabInfo.accent + '30', borderColor: tabInfo.accent }]}>
                    <Text style={{ fontSize: 14 }}>{ev.displayIcon}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[ss.eventLabel, { color: c.text }]} numberOfLines={1}>{ev.displayLabel}</Text>
                    <Text style={[ss.eventTime, { color: c.sub }]}>{wallTimeToLabel(ev.wallTime)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeEvent(ev.id)} style={ss.deleteBtn}>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <View style={[ss.actionRow, { paddingHorizontal: 12 }]}>
          {todayEvents.length > 0 && (
            <TouchableOpacity style={[ss.actionBtn, { backgroundColor: c.card, borderColor: c.border, borderWidth: 1 }]}
              onPress={() => setSaveRoutineModal(true)}>
              <Ionicons name="bookmark-outline" size={16} color={c.active} />
              <Text style={[ss.actionBtnTxt, { color: c.active }]}>Save</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[ss.actionBtn, { backgroundColor: todayEvents.length > 0 ? tabAccent : c.border, flex: 1 }]}
            onPress={handleSimulate}
            disabled={simulationStatus === 'running' || simulationStatus === 'queued'}>
            <Ionicons name="flash" size={16} color="#fff" />
            <Text style={[ss.actionBtnTxt, { color: '#fff' }]}>
              {simulationStatus === 'running' ? 'Simulating...' : `Simulate (${todayEvents.length} events)`}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ────────────────────────────────────────────────────────────────────────────
  // MODALS
  // ────────────────────────────────────────────────────────────────────────────

  const renderModals = () => (
    <>
      <Modal visible={showSubPicker} transparent animationType="slide">
        <View style={ss.modalOverlay}>
          <View style={[ss.modalCard, { backgroundColor: c.card, maxHeight: '80%' }]}>
            <View style={ss.rowBetween}>
              <Text style={[ss.modalTitle, { color: c.text }]}>Select Substance</Text>
              <TouchableOpacity onPress={() => setShowSubPicker(false)}>
                <Ionicons name="close" size={22} color={c.sub} />
              </TouchableOpacity>
            </View>
            <TextInput style={[ss.searchInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              placeholder="Search substances…" placeholderTextColor={c.sub}
              value={subSearch} onChangeText={setSubSearch} />
            <ScrollView showsVerticalScrollIndicator={false}>
              {filteredSubs.map(s => (
                <TouchableOpacity key={s}
                  style={[ss.subPickerRow, { borderBottomColor: c.border }, s === subName && { backgroundColor: '#8b5cf615' }]}
                  onPress={() => { setSubName(s); setShowSubPicker(false); setSubSearch(''); }}>
                  <Text style={[ss.subPickerName, { color: c.text }]}>{s}</Text>
                  {s === subName && <Ionicons name="checkmark" size={18} color="#8b5cf6" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <IPConfigModal visible={showIPModal} onClose={() => setShowIPModal(false)}
        onSave={handleSaveIP} currentIP={biogearsIP} currentPort={biogearsPort} c={c} />

      <Modal visible={saveRoutineModal} transparent animationType="slide">
        <View style={ss.modalOverlay}>
          <View style={[ss.modalCard, { backgroundColor: c.card }]}>
            <Text style={[ss.modalTitle, { color: c.text }]}>Save Routine</Text>
            <Text style={[ss.modalSub, { color: c.sub }]}>Events saved with their wall times. Loading later adds them at the same times of day.</Text>
            <TextInput style={[ss.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              placeholder="e.g. 'Gym Day'" placeholderTextColor={c.sub}
              value={routineName} onChangeText={setRoutineName} />
            <View style={ss.rowBetween}>
              <TouchableOpacity style={[ss.modalBtn, { borderColor: c.border, borderWidth: 1 }]} onPress={() => setSaveRoutineModal(false)}>
                <Text style={{ color: c.sub }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ss.modalBtn, { backgroundColor: c.active }]} onPress={handleSaveRoutine}>
                <Text style={{ color: '#fff' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={simNameModal} transparent animationType="fade">
        <View style={ss.modalOverlay}>
          <View style={[ss.modalCard, { backgroundColor: c.card }]}>
            <Text style={[ss.modalTitle, { color: c.text }]}>Name This Simulation</Text>
            <Text style={[ss.modalSub, { color: c.sub }]}>{todayEvents.length} events will be sent to BioGears at {biogearsIP}:{biogearsPort}.</Text>
            <TextInput style={[ss.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              placeholder="e.g. 'Monday Gym'" placeholderTextColor={c.sub}
              value={pendingSimName} onChangeText={setPendingSimName} />
            <View style={ss.rowBetween}>
              <TouchableOpacity style={[ss.modalBtn, { borderColor: c.border, borderWidth: 1 }]} onPress={() => setSimNameModal(false)}>
                <Text style={{ color: c.sub }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ss.modalBtn, { backgroundColor: tabAccent }]} onPress={startSimulation}>
                <Ionicons name="flash" size={16} color="#fff" />
                <Text style={{ color: '#fff', marginLeft: 4, fontWeight: '700' }}>Run Simulation</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );

  // ────────────────────────────────────────────────────────────────────────────
  // ROOT RENDER
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <View style={[ss.root, { backgroundColor: c.bg }]}>
      <Header title={mode === 'dashboard' ? 'Clinical Twin' : 'Log Routine'} showBack={false} />

      {twinStatus === 'unregistered' && (
        <View style={[ss.noticeBar, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b', marginTop: insets.top + 52 }]}>
          <Ionicons name="warning-outline" size={14} color="#f59e0b" />
          <Text style={ss.noticeTxt}>No twin registered — Profile → Calibrate Twin</Text>
        </View>
      )}

      {mode === 'dashboard' ? renderDashboard() : renderRoutinePanel()}

      <TouchableOpacity
        style={[ss.fab, { backgroundColor: mode === 'dashboard' ? c.active : '#ef4444', bottom: insets.bottom + 8 }]}
        onPress={() => switchMode(mode === 'dashboard' ? 'routine' : 'dashboard')}>
        <Animated.View style={{ transform: [{ rotate: fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
          <Ionicons name="add" size={32} color="#fff" />
        </Animated.View>
      </TouchableOpacity>

      {renderModals()}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: { flex: 1 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowCentered: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },

  noticeBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginHorizontal: 12, borderRadius: 10, borderWidth: 1, marginBottom: 0 },
  noticeTxt: { color: '#f59e0b', fontSize: 12, flex: 1 },

  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  stepItem: { alignItems: 'center' },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  stepDotActive: { backgroundColor: '#38bdf8' },
  stepNum: { color: '#94a3b8', fontSize: 10, fontWeight: '700' },
  stepLabel: { color: '#64748b', fontSize: 10, marginTop: 2 },
  stepLabelActive: { color: '#38bdf8' },
  stepLine: { width: 24, height: 2, backgroundColor: '#334155', marginHorizontal: 2 },
  stepLineActive: { backgroundColor: '#38bdf8' },
  simBox: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, alignItems: 'center' },
  simMsg: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  errorBox: { borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  errorTxt: { color: '#ef4444', fontSize: 13, flex: 1 },
  interactionBanner: { backgroundColor: '#fbbf2420', borderRadius: 10, padding: 10, flexDirection: 'row', gap: 8, marginBottom: 10, borderWidth: 1, borderColor: '#fbbf24' },
  interactionTxt: { color: '#fbbf24', fontSize: 12, flex: 1 },

  scoreBadge: { borderRadius: 20, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  scoreLetter: { fontSize: 48, fontWeight: '900', color: '#fff' },
  scoreLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  scoreNum: { fontSize: 36, fontWeight: '800', color: '#fff' },
  scoreSubLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },

  vitalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  vitalCard: { width: (W - 52) / 2, borderRadius: 16, padding: 14, borderWidth: 1 },
  vitalIcon: { fontSize: 20, marginBottom: 4 },
  vitalValue: { fontSize: 28, fontWeight: '800' },
  vitalUnit: { color: '#64748b', fontSize: 11, marginTop: 1 },
  vitalLabel: { color: '#94a3b8', fontSize: 12, marginTop: 4, fontWeight: '600' },
  vitalNormal: { color: '#475569', fontSize: 10, marginTop: 2 },
  emptyCard: { borderRadius: 20, padding: 32, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  insightPill: { borderRadius: 12, padding: 12, marginBottom: 8 },
  organCard: { width: 100, alignItems: 'center', borderRadius: 16, padding: 12, marginRight: 10, borderWidth: 1 },
  organScore: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  organName: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  organBar: { width: '100%', height: 4, backgroundColor: '#1e293b', borderRadius: 2, marginTop: 6 },
  organBarFill: { height: 4, borderRadius: 2 },
  analyticsCard: { borderRadius: 16, padding: 16 },
  analyticsTitle: { fontSize: 11, marginBottom: 4 },
  analyticsValue: { fontSize: 28, fontWeight: '800' },
  analyticsLabel: { fontSize: 12, marginTop: 2 },
  macroCard: { borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' },
  macroDiv: { width: 1, height: 32, marginHorizontal: 4 },
  routineCard: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  routineIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center' },
  routineName: { fontWeight: '600', fontSize: 14 },
  routineMeta: { fontSize: 12, marginTop: 2 },
  sessionCard: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  sessionDot: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sessionName: { fontWeight: '600', fontSize: 14 },
  sessionMeta: { fontSize: 12, marginTop: 2 },
  sessionInsight: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },

  eventBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginHorizontal: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1 },
  eventBannerTxt: { flex: 1, fontSize: 13, fontWeight: '600' },
  simBadgeBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },

  tabBar: { borderBottomWidth: 1 },
  tabBtn: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  tabBtnLabel: { fontSize: 11, fontWeight: '600' },
  tabPanel: { borderRadius: 20, padding: 18, marginTop: 10, borderWidth: 1 },

  sectionLbl: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginTop: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#334155', backgroundColor: 'transparent', marginRight: 6 },
  chipSm: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: '#334155', backgroundColor: 'transparent' },
  chipTxt: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  numRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
  numInput: { flex: 1, fontSize: 16, fontWeight: '600' },
  numSuffix: { fontSize: 13, marginLeft: 8 },
  addBtn: { borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  timeLbl: { fontSize: 12, fontWeight: '500' },

  sliderLabel: { fontSize: 12 },
  sliderVal: { fontSize: 14, fontWeight: '700' },
  sliderTrack: { height: 6, borderRadius: 3, marginBottom: 8 },
  sliderFill: { height: 6, borderRadius: 3 },
  sliderBtns: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },

  bigDisplay: { alignItems: 'center', borderRadius: 20, borderWidth: 1.5, padding: 20, marginBottom: 14 },
  bigNum: { fontSize: 52, fontWeight: '900' },
  bigUnit: { fontSize: 14, marginTop: 2 },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  quickChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
  quickChipTxt: { color: '#94a3b8', fontWeight: '600', fontSize: 13 },

  infoBox: { borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, marginBottom: 6 },

  subSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12 },
  searchInput: { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 10, fontSize: 14 },
  subPickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 0.5 },
  subPickerName: { fontSize: 14 },

  modeSwitch: { flexDirection: 'row', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#334155', marginBottom: 12 },
  modeSwitchBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  modeSwitchTxt: { fontWeight: '600', fontSize: 14, color: '#94a3b8' },

  previewBox: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12 },
  previewTitle: { fontSize: 9, letterSpacing: 1, fontWeight: '700', marginBottom: 8 },
  triRow: { flexDirection: 'row', gap: 8 },
  macroG: { fontWeight: '800', fontSize: 15 },
  macroLbl: { fontSize: 11, marginTop: 1 },

  timelineRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, marginBottom: 8, overflow: 'hidden', borderWidth: 1 },
  timelineLine: { width: 3, alignSelf: 'stretch' },
  timelineDot: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', margin: 8, borderWidth: 1 },
  eventLabel: { fontWeight: '600', fontSize: 13 },
  eventTime: { fontSize: 11, marginTop: 2 },
  deleteBtn: { padding: 12 },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtnTxt: { fontWeight: '700', fontSize: 14 },

  fab: { position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalCard: { borderRadius: 24, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalSub: { fontSize: 13, marginBottom: 16, lineHeight: 20 },
  input: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14, marginBottom: 16 },
  modalBtn: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },

  dashTabBar: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 16 },
  dashTabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  dashTabIcon: { fontSize: 18 },
  dashTabLabel: { fontSize: 11, fontWeight: '700', paddingBottom: 6 },

  vitalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  macroRingsCard: { borderRadius: 20, padding: 16, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 8 },
  macroRingWrap: { alignItems: 'center' },
  macroOuterRing: { justifyContent: 'center', alignItems: 'center', borderWidth: 7 },
  macroInnerRing: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  macroRingVal: { fontWeight: '800', fontSize: 16, textAlign: 'center' },
  macroRingUnit: { fontSize: 9, textAlign: 'center', marginTop: -2 },
  macroRingLabel: { fontSize: 11, fontWeight: '600', marginTop: 8 },

  // ── Meal tab simplified styles ──
  mealInfoCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 4 },
  mealInfoEmoji: { fontSize: 28 },
  mealInfoTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  mealInfoSub:   { fontSize: 12, lineHeight: 17 },
});