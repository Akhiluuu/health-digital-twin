// app/session/[sessionId].tsx — Session Detail Screen
// Shows vitals timeline, event log, AI insights, and anomaly badges for a past simulation

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBiogearsTwin } from '../../context/BiogearsTwinContext';
import { useTheme } from '../../context/ThemeContext';
import { colors as themeColors } from '../../theme/colors';
import * as BiogearsAPI from '../../services/biogears';

const { width: W } = Dimensions.get('window');

function VitalRow({ label, value, unit, normal, icon }: any) {
  return (
    <View style={sd.vitalRow}>
      <Text style={sd.vitalIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={sd.vitalLabel}>{label}</Text>
        {normal && <Text style={sd.vitalNormal}>Normal: {normal}</Text>}
      </View>
      <Text style={sd.vitalValue}>{value != null ? `${value}` : '—'}</Text>
      <Text style={sd.vitalUnit}>{unit}</Text>
    </View>
  );
}

export default function SessionDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const c = themeColors[theme as 'light' | 'dark'] ?? themeColors['dark'];
  const { sessions, twinUserId } = useBiogearsTwin();

  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Find session in local store
  const session = sessions.find(s => s.session_id === sessionId);

  useEffect(() => {
    if (twinUserId && sessionId) {
      setLoading(true);
      BiogearsAPI.getSessionData(twinUserId, sessionId)
        .then(data => setTimelineData(Array.isArray(data) ? data : []))
        .catch(() => setTimelineData([]))
        .finally(() => setLoading(false));
    }
  }, [twinUserId, sessionId]);

  if (!session) {
    return (
      <View style={[sd.root, { backgroundColor: c.bg }]}>
        <TouchableOpacity style={sd.backBtn} onPress={router.back}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
          <Text style={[sd.backTxt, { color: c.text }]}>Back</Text>
        </TouchableOpacity>
        <View style={sd.center}>
          <Text style={{ color: c.sub, fontSize: 16 }}>Session not found in local history.</Text>
        </View>
      </View>
    );
  }

  const v = BiogearsAPI.sanitizeBiogearsVitals(session.vitals_snapshot);

  return (
    <View style={[sd.root, { backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[sd.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={router.back} style={sd.backBtn}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[sd.title, { color: c.text }]} numberOfLines={1}>
              {session.name || 'Simulation'}
            </Text>
            {session.is_automatic && (
              <View style={{ backgroundColor: '#a78bfa25', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 0.5, borderColor: '#a78bfa60' }}>
                <Text style={{ color: '#c084fc', fontSize: 9, fontWeight: '700' }}>🤖 Auto-Run</Text>
              </View>
            )}
          </View>
          <Text style={[sd.subtitle, { color: c.sub }]}>
            {session.timestamp ? new Date(session.timestamp).toLocaleString('en-IN') : ''}
            {session.event_count != null ? ` · ${session.event_count} events` : ''}
          </Text>
        </View>
        {session.has_anomaly && (
          <View style={sd.anomalyBadge}>
            <Ionicons name="warning" size={14} color="#ef4444" />
            <Text style={sd.anomalyTxt}>Anomaly</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}>

        {/* ── Vitals Snapshot ── */}
        {v && (
          <>
            <Text style={[sd.section, { color: c.text }]}>Vitals Snapshot</Text>
            <View style={[sd.card, { backgroundColor: c.card }]}>
              <VitalRow label="Heart Rate" value={v.heart_rate ? Math.round(v.heart_rate) : null}
                unit="bpm" icon="🫀" normal="60–100" />
              {v.blood_pressure && (
                <VitalRow label="Blood Pressure" value={v.blood_pressure}
                  unit="mmHg" icon="🩸" normal="90/60–120/80" />
              )}
              <VitalRow label="Glucose" value={v.glucose ? Math.round(v.glucose) : null}
                unit="mg/dL" icon="🍬" normal="70–140" />
              <VitalRow label="SpO₂" value={v.spo2 ? Math.round(v.spo2) : null}
                unit="%" icon="🫁" normal="94–100" />
              <VitalRow label="Respiration" value={v.respiration ? Math.round(v.respiration) : null}
                unit="br/min" icon="💨" normal="12–20" />
              {v.core_temperature != null && (
                <VitalRow label="Core Temp" value={(v.core_temperature || 0).toFixed(1)}
                  unit="°C" icon="🌡️" normal="36.5–37.5" />
              )}
              {v.map != null && (
                <VitalRow label="MAP" value={Math.round(v.map || 0)}
                  unit="mmHg" icon="📈" normal="70–100" />
              )}
              {v.cardiac_output != null && (
                <VitalRow label="Cardiac Output" value={(v.cardiac_output || 0).toFixed(1)}
                  unit="L/min" icon="❤️" normal="4–8" />
              )}
            </View>
          </>
        )}

        {/* ── AI Insights ── */}
        {session.ai_insights && session.ai_insights.length > 0 && (
          <>
            <Text style={[sd.section, { color: c.text }]}>AI Insights</Text>
            {session.ai_insights.map((ins, i) => (
              <View key={i} style={[sd.insightPill, { backgroundColor: c.card }]}>
                <Text style={{ color: c.text, fontSize: 13, lineHeight: 20 }}>{ins}</Text>
              </View>
            ))}
          </>
        )}

        {/* ── Event Log ── */}
        {session.events && session.events.length > 0 && (
          <>
            <Text style={[sd.section, { color: c.text }]}>Event Log</Text>
            <View style={[sd.card, { backgroundColor: c.card }]}>
              {session.events.map((ev: any, i: number) => {
                const icons: Record<string, string> = {
                  meal: '🍽️', water: '💧', exercise: '🏃', substance: '☕', sleep: '😴', stress: '🧘',
                };
                return (
                  <View key={i} style={[sd.eventRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                    <Text style={{ fontSize: 20 }}>{icons[ev.event_type] ?? '📌'}</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>
                        {ev.event_type.charAt(0).toUpperCase() + ev.event_type.slice(1)}
                      </Text>
                      <Text style={{ color: c.sub, fontSize: 12 }}>
                        Value: {ev.value}
                        {ev.meal_type ? ` · ${ev.meal_type}` : ''}
                        {ev.duration_seconds ? ` · ${Math.round(ev.duration_seconds / 60)}min` : ''}
                        {ev.substance_name ? ` · ${ev.substance_name}` : ''}
                      </Text>
                    </View>
                    {(ev.wallTime || ev.timestamp) && (
                      <Text style={{ color: c.sub, fontSize: 11 }}>
                        {ev.wallTime || new Date((ev.timestamp || 0) * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Timeline Data ── */}
        {loading && (
          <View style={sd.center}>
            <ActivityIndicator color={c.active} />
            <Text style={{ color: c.sub, marginTop: 8, fontSize: 13 }}>Loading timeseries...</Text>
          </View>
        )}

        {!loading && timelineData.length > 0 && (
          <>
            <Text style={[sd.section, { color: c.text }]}>
              Timeseries ({timelineData.length} data points)
            </Text>
            <View style={[sd.card, { backgroundColor: c.card }]}>
              <Text style={{ color: c.sub, fontSize: 12, marginBottom: 8 }}>
                First → Last physiological values from engine output
              </Text>
              {['HeartRate', 'OxygenSaturation', 'BloodGlucose', 'CoreTemperature'].map(key => {
                const first = timelineData[0]?.[key];
                const last = timelineData[timelineData.length - 1]?.[key];
                if (first == null) return null;
                return (
                  <View key={key} style={[sd.timelineRow, { borderBottomColor: c.border }]}>
                    <Text style={{ color: c.text, fontSize: 13, flex: 1 }}>{key}</Text>
                    <Text style={{ color: c.sub, fontSize: 12 }}>
                      {typeof first === 'number' ? first.toFixed(2) : first}
                      {last != null ? ` → ${typeof last === 'number' ? last.toFixed(2) : last}` : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {!loading && timelineData.length === 0 && (
          <View style={[sd.card, { backgroundColor: c.card, alignItems: 'center', marginTop: 8 }]}>
            <Ionicons name="analytics-outline" size={32} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 13, marginTop: 8 }}>
              Detailed timeseries not available for this session
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const sd = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 52, borderBottomWidth: 1, gap: 8 },
  backBtn: { padding: 4 },
  backTxt: { fontSize: 16, marginLeft: 4 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  anomalyBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ef444420', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  anomalyTxt: { color: '#ef4444', fontSize: 11, fontWeight: '700' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32, flex: 1 },
  section: { fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  card: { borderRadius: 16, overflow: 'hidden' },
  insightPill: { borderRadius: 12, padding: 12, marginBottom: 8 },
  vitalRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  vitalIcon: { fontSize: 20 },
  vitalLabel: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  vitalNormal: { color: '#475569', fontSize: 11, marginTop: 1 },
  vitalValue: { fontSize: 18, fontWeight: '800', color: '#f1f5f9' },
  vitalUnit: { color: '#64748b', fontSize: 11, marginLeft: 4 },
  eventRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
});
