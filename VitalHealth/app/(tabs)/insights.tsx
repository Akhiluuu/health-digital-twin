import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions,
  ActivityIndicator, Platform, RefreshControl, TextInput, KeyboardAvoidingView,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBiogearsTwin } from '../../context/BiogearsTwinContext';
import { useTheme } from '../../context/ThemeContext';
import { colors } from '../../theme/colors';
import Header from '../components/Header';
import Svg, { Circle, Path } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'system';
  text: string;
}

const genId = () => Math.random().toString(36).slice(2, 9);

// ── Inline markdown renderer ──────────────────────────────────────────────────

function MarkdownText({ text, style }: { text: string; style?: any }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <Text key={i} style={{ fontWeight: '700' }}>{p.slice(2, -2)}</Text>
          : <Text key={i}>{p}</Text>
      )}
    </Text>
  );
}

// ── AI Insights Card ──────────────────────────────────────────────────────────

function AIInsightsCard({
  insightsText, bulletPoints, isLoading, theme: c,
}: { insightsText: string; bulletPoints: string[]; isLoading: boolean; theme: any }) {
  const [expanded, setExpanded] = useState(false);
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
  }, [isLoading]);

  return (
    <View style={[S.aiCard, { backgroundColor: c.card }]}>
      <View style={S.aiHeader}>
        <LinearGradient colors={['#6366f1','#8b5cf6']} style={S.aiIcon} start={{x:0,y:0}} end={{x:1,y:1}}>
          <Text style={{ fontSize: 16 }}>🧬</Text>
        </LinearGradient>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[S.aiTitle, { color: c.text }]}>Dr. Aria's Analysis</Text>
          <Text style={[S.aiSub, { color: c.sub }]}>
            {isLoading ? 'Generating personalised insights…' : 'AI-powered simulation insights'}
          </Text>
        </View>
        {isLoading && <Animated.View style={{ opacity: pulse }}><ActivityIndicator size="small" color="#6366f1" /></Animated.View>}
      </View>

      {bulletPoints.length > 0 && (
        <View style={{ gap: 8, marginBottom: 10 }}>
          {bulletPoints.map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#6366f1', marginTop: 7 }} />
              <MarkdownText text={b} style={[S.bulletText, { color: c.text }]} />
            </View>
          ))}
        </View>
      )}

      {insightsText.length > 0 && (
        <>
          {expanded && (
            <View style={[S.narrativeBox, { borderTopColor: c.border }]}>
              {insightsText.split('\n').map((line, i) => {
                if (!line.trim()) return <View key={i} style={{ height: 5 }} />;
                if (line.startsWith('## ') || line.startsWith('### '))
                  return <Text key={i} style={[S.narrativeH, { color: c.text }]}>{line.replace(/^##+ /, '')}</Text>;
                if (line.startsWith('> '))
                  return <Text key={i} style={[S.narrativeDisclaim, { color: c.sub }]}>{line.replace(/^> /, '')}</Text>;
                return <MarkdownText key={i} text={line} style={[S.narrativeLine, { color: c.text }]} />;
              })}
            </View>
          )}
          <TouchableOpacity onPress={() => setExpanded(e => !e)} style={{ marginTop: 8 }} activeOpacity={0.7}>
            <Text style={{ color: '#6366f1', fontSize: 13, fontWeight: '600' }}>
              {expanded ? 'Show less ▲' : 'Read full analysis ▼'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {!isLoading && !bulletPoints.length && !insightsText.length && (
        <Text style={[S.aiPlaceholder, { color: c.sub }]}>Run a simulation to receive personalised AI insights.</Text>
      )}
    </View>
  );
}

// ── Simulation Q&A Chat ───────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Is my heart rate normal?',
  'What does my glucose level mean?',
  'Are there any concerns I should know about?',
  'What should I improve after this simulation?',
];

function SimulationChat({
  lastVitals, querySimulation, theme: c,
}: { lastVitals: any; querySimulation: (q: string) => Promise<string>; theme: any }) {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'init', role: 'ai',
    text: "Hi! I'm Dr. Aria 👩‍⚕️ Ask me anything about your latest simulation — your vitals, anomalies, or what the numbers mean for you.",
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async (q: string) => {
    if (!q.trim() || loading) return;
    setInput('');
    setMessages(p => [...p, { id: genId(), role: 'user', text: q }]);
    setLoading(true);
    try {
      const reply = await querySimulation(q);
      setMessages(p => [...p, { id: genId(), role: 'ai', text: reply }]);
    } catch (e: any) {
      setMessages(p => [...p, { id: genId(), role: 'system', text: `❌ ${e.message || 'Connection error'}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <View style={[S.chatBox, { backgroundColor: c.card }]}>
      <View style={S.chatHead}>
        <LinearGradient colors={['#0ea5e9','#6366f1']} style={S.chatIcon} start={{x:0,y:0}} end={{x:1,y:1}}>
          <Text style={{ fontSize: 14 }}>👩‍⚕️</Text>
        </LinearGradient>
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={[S.chatTitle, { color: c.text }]}>Ask About Your Results</Text>
          <Text style={[S.chatSub, { color: c.sub }]}>{lastVitals ? 'Simulation loaded — ask away!' : 'Run a simulation first'}</Text>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ maxHeight: 260 }} contentContainerStyle={{ padding: 12, paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
        {messages.map(msg => (
          <View key={msg.id} style={[{ marginBottom: 8 }, msg.role === 'user' ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
            {msg.role === 'system'
              ? <Text style={[{ fontSize: 12, textAlign: 'center' }, { color: c.sub }]}>{msg.text}</Text>
              : (
                <View style={[S.bubble, msg.role === 'user' ? S.bubbleUser : [S.bubbleAi, { backgroundColor: c.bg }]]}>
                  <MarkdownText text={msg.text} style={[S.msgText, { color: msg.role === 'user' ? '#fff' : c.text }]} />
                </View>
              )
            }
          </View>
        ))}
        {loading && (
          <View style={{ alignItems: 'flex-start', marginBottom: 8 }}>
            <View style={[S.bubble, S.bubbleAi, { backgroundColor: c.bg }]}>
              <ActivityIndicator size="small" color="#6366f1" />
            </View>
          </View>
        )}
      </ScrollView>

      {messages.length <= 1 && lastVitals && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
          {SUGGESTIONS.map(s => (
            <TouchableOpacity key={s} onPress={() => setInput(s)}
              style={[S.chip, { backgroundColor: c.bg, borderColor: '#6366f1' }]}>
              <Text style={[S.chipText, { color: '#6366f1' }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={[S.inputRow, { borderTopColor: c.border }]}>
        <TextInput
          style={[S.chatInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
          value={input}
          onChangeText={setInput}
          placeholder={lastVitals ? 'Ask about your simulation…' : 'Run a simulation first…'}
          placeholderTextColor={c.sub}
          editable={!!lastVitals && !loading}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[S.sendBtn, { backgroundColor: input.trim() && !loading && lastVitals ? '#6366f1' : c.border }]}
          onPress={() => send(input)}
          disabled={!input.trim() || loading || !lastVitals}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const {
    sessions, refreshSessions, organScores, vitalsTrends, refreshAnalytics,
    todayMacros, twinStatus, lastVitals,
    lastAiInsights, lastAiInsightsText, aiInsightsLoading, querySimulation,
  } = useBiogearsTwin();

  const [refreshing, setRefreshing] = useState(false);
  const c = colors[theme];
  const insets = useSafeAreaInsets();
  const headerH = Math.max(insets.top, Platform.OS === 'android' ? 24 : 20) + 52;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshSessions(), refreshAnalytics()]);
    setRefreshing(false);
  }, [refreshSessions, refreshAnalytics]);

  useEffect(() => { refreshAnalytics(); refreshSessions(); }, []);

  if (twinStatus === 'unregistered') {
    return (
      <View style={[S.container, { backgroundColor: c.bg }]}>
        <Header title="Insights" showBack={false} />
        <View style={[S.emptyBox, { marginTop: headerH }]}>
          <Ionicons name="analytics-outline" size={80} color={c.sub} />
          <Text style={[S.emptyTitle, { color: c.text }]}>No Insights Yet</Text>
          <Text style={[S.emptySub, { color: c.sub }]}>Register your Digital Twin to start tracking physiological trends.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[S.container, { backgroundColor: c.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Physiology Insights" showBack={false} />
      <ScrollView
        style={S.scroll}
        contentContainerStyle={[S.scrollContent, { paddingTop: headerH }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.active} progressViewOffset={headerH} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* AI ANALYSIS */}
        <Text style={[S.sectionTitle, { color: c.text }]}>AI Health Analysis</Text>
        <AIInsightsCard insightsText={lastAiInsightsText} bulletPoints={lastAiInsights} isLoading={aiInsightsLoading} theme={c} />

        {/* ASK DR. ARIA */}
        <Text style={[S.sectionTitle, { color: c.text }]}>Ask Dr. Aria</Text>
        <SimulationChat lastVitals={lastVitals} querySimulation={querySimulation} theme={c} />

        {/* NUTRITION */}
        <Text style={[S.sectionTitle, { color: c.text }]}>Daily Nutrition Balance</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <MacroRing label="Calories" value={todayMacros.calories} target={2500} unit="kcal" color="#38bdf8" theme={c} />
          <View style={{ flex: 1, paddingLeft: 10 }}>
            <MacroStat label="Carbs"   value={todayMacros.carbs}   target={300} color="#f59e0b" theme={c} />
            <MacroStat label="Protein" value={todayMacros.protein} target={150} color="#ef4444" theme={c} />
            <MacroStat label="Fat"     value={todayMacros.fat}     target={80}  color="#10b981" theme={c} />
          </View>
        </View>

        {/* ORGAN SCORES */}
        <Text style={[S.sectionTitle, { color: c.text }]}>Organ System Health</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, paddingLeft: 20, marginBottom: 10 }}>
          {organScores?.scores ? (
            Object.entries(organScores.scores).map(([name, data]: [string, any]) => (
              <OrganCard key={name} name={name} score={data.score} status={data.status} theme={c} />
            ))
          ) : (
            <View style={{ width: SCREEN_WIDTH - 40, alignItems: 'center' }}>
              <Text style={{ color: c.sub }}>Simulate a routine to see organ scores.</Text>
            </View>
          )}
        </ScrollView>

        {/* TRENDS */}
        <Text style={[S.sectionTitle, { color: c.text }]}>Vitals Trajectory</Text>
        <View style={[S.card, { backgroundColor: c.card }]}>
          <TrendChart data={vitalsTrends?.sessions || []} metric="heart_rate" label="Heart Rate" color="#38bdf8" theme={c} />
          <View style={{ height: 1, backgroundColor: '#ffffff10', marginVertical: 10 }} />
          <TrendChart data={vitalsTrends?.sessions || []} metric="glucose"    label="Glucose"    color="#f59e0b" theme={c} />
        </View>

        {/* HISTORY */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[S.sectionTitle, { color: c.text }]}>Simulation History</Text>
          <TouchableOpacity onPress={refreshSessions}><Text style={{ color: c.active }}>Refresh</Text></TouchableOpacity>
        </View>
        {sessions.length === 0 ? (
          <Text style={[S.emptySub, { color: c.sub, textAlign: 'center', marginTop: 20 }]}>
            No simulations recorded. Go to 'Twin' to log your first routine.
          </Text>
        ) : (
          sessions.map(s => (
            <TouchableOpacity key={s.session_id} style={[S.historyCard, { backgroundColor: c.card }]}
              onPress={() => router.push(`/session/${s.session_id}`)}>
              <View style={[S.sessionIcon, { backgroundColor: s.has_anomaly ? '#ef444420' : '#10b98120' }]}>
                <Ionicons name={s.has_anomaly ? 'warning' : 'checkmark-circle'} size={24} color={s.has_anomaly ? '#ef4444' : '#10b981'} />
              </View>
              <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={[{ fontSize: 16, fontWeight: '600' }, { color: c.text }]}>{s.name || 'Simulation Run'}</Text>
                <Text style={[{ fontSize: 12, marginTop: 2 }, { color: c.sub }]}>
                  {s.timestamp ? new Date(s.timestamp).toLocaleDateString() : 'Recent'} · {s.event_count || 0} events
                </Text>
                {s.ai_insights?.[0] && (
                  <Text style={[{ fontSize: 12, marginTop: 4, fontStyle: 'italic' }, { color: c.sub }]} numberOfLines={1}>
                    {s.ai_insights[0]}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={c.sub} />
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={S.fabWrap}>
        <TouchableOpacity style={[S.fab, { backgroundColor: c.active }]} onPress={() => router.navigate('/twin')}>
          <Ionicons name="add" size={32} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MacroRing({ value, target, unit, color, theme }: any) {
  const size = 120; const stroke = 10;
  const r = (size - stroke) / 2; const circ = 2 * Math.PI * r;
  const offset = circ - Math.min(value / target, 1) * circ;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 140 }}>
      <Svg width={size} height={size}>
        <Circle cx={size/2} cy={size/2} r={r} stroke={theme.border} strokeWidth={stroke} fill="none" />
        <Circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90, ${size/2}, ${size/2})`} />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text }}>{Math.round(value)}</Text>
        <Text style={{ fontSize: 12, color: theme.sub }}>{unit}</Text>
      </View>
    </View>
  );
}

function MacroStat({ label, value, target, color, theme }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: theme.sub }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>{Math.round(value)}g</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, marginTop: 4, overflow: 'hidden', backgroundColor: theme.border }}>
        <View style={{ height: '100%', borderRadius: 3, width: `${Math.min(value / (target || 1), 1) * 100}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}

function OrganCard({ name, score, status, theme }: any) {
  const color = status.includes('Critical') ? '#ef4444' : status.includes('Warning') ? '#f59e0b' : '#10b981';
  return (
    <View style={[S.organCard, { backgroundColor: theme.card }]}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{name}</Text>
      <Text style={{ fontSize: 20, fontWeight: '800', marginVertical: 4, color }}>{score}%</Text>
      <Text style={{ fontSize: 10, textAlign: 'center', color: theme.sub }}>{status}</Text>
    </View>
  );
}

function TrendChart({ data, metric, label, color, theme }: any) {
  if (!data || data.length < 2) return null;
  const values: number[] = data.map((d: any) => d[metric]).filter((v: any) => v != null);
  if (values.length < 2) return null;
  const h = 80; const w = SCREEN_WIDTH - 80;
  const max = Math.max(...values); const min = Math.min(...values); const range = max - min || 1;
  const pts = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (values.length - 1)) * w} ${h - ((v - min) / range) * h}`);
  return (
    <View style={{ marginVertical: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, fontWeight: '500', color: theme.sub }}>{label}</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{Math.round(values[values.length - 1])}</Text>
      </View>
      <Svg width={w} height={h} style={{ marginTop: 10 }}>
        <Path d={pts.join(' ')} stroke={color} strokeWidth={2} fill="none" />
      </Svg>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container:       { flex: 1 },
  scroll:          { flex: 1 },
  scrollContent:   { padding: 20 },
  emptyBox:        { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, marginTop: 100 },
  emptyTitle:      { fontSize: 22, fontWeight: '700', marginTop: 20 },
  emptySub:        { fontSize: 16, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  sectionTitle:    { fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 12 },

  aiCard:          { borderRadius: 20, padding: 18, marginBottom: 4 },
  aiHeader:        { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  aiIcon:          { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  aiTitle:         { fontSize: 16, fontWeight: '700' },
  aiSub:           { fontSize: 12, marginTop: 2 },
  bulletText:      { flex: 1, fontSize: 14, lineHeight: 20 },
  narrativeBox:    { borderTopWidth: 1, paddingTop: 14, marginTop: 8, gap: 4 },
  narrativeH:      { fontSize: 15, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  narrativeLine:   { fontSize: 14, lineHeight: 20 },
  narrativeDisclaim: { fontSize: 12, fontStyle: 'italic', marginTop: 8 },
  aiPlaceholder:   { fontSize: 14, textAlign: 'center', paddingVertical: 12 },

  chatBox:         { borderRadius: 20, overflow: 'hidden', marginBottom: 4 },
  chatHead:        { flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 10 },
  chatIcon:        { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  chatTitle:       { fontSize: 15, fontWeight: '700' },
  chatSub:         { fontSize: 11, marginTop: 1 },
  bubble:          { maxWidth: '85%', borderRadius: 16, padding: 10 },
  bubbleUser:      { backgroundColor: '#6366f1', borderBottomRightRadius: 4 },
  bubbleAi:        { borderBottomLeftRadius: 4 },
  msgText:         { fontSize: 14, lineHeight: 20 },
  chip:            { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  chipText:        { fontSize: 13, fontWeight: '500' },
  inputRow:        { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, gap: 8 },
  chatInput:       { flex: 1, height: 40, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 },
  sendBtn:         { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  card:            { borderRadius: 20, padding: 20, marginBottom: 15 },
  organCard:       { width: 120, padding: 15, borderRadius: 16, marginRight: 15, alignItems: 'center' },
  historyCard:     { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 18, marginBottom: 12 },
  sessionIcon:     { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  fabWrap:         { position: 'absolute', right: 25, bottom: 25 },
  fab:             {
    width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8,
  },
});