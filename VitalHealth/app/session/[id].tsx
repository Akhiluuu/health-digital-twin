import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBiogearsTwin } from '../../context/BiogearsTwinContext';
import { useTheme } from '../../context/ThemeContext';
import { colors } from '../../theme/colors';
import Header from '../components/Header';
import { BlurView } from 'expo-blur';

import { sanitizeBiogearsVitals } from '../../services/biogears';
import { useStackBackHandler } from "../../hooks/useStackBackHandler";

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * SESSION DETAIL SCREEN
 * Displays the full physiological 'sheet' of all 13+ vitals from a specific simulation.
 * Replaces the "Old UI" raw data view with a premium, organized command center.
 */
export default function SessionDetailScreen() {
  useStackBackHandler();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { theme } = useTheme();
  const { sessions } = useBiogearsTwin();
  const c = colors[theme];

  const session = useMemo(() => sessions.find((s) => s.session_id === id), [sessions, id]);

  if (!session) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <Header title="Result Not Found" />
        <View style={styles.center}>
          <Text style={{ color: c.sub }}>Could not find session data for ID: {id}</Text>
        </View>
      </View>
    );
  }

  const vitals = sanitizeBiogearsVitals(session.vitals_snapshot);

  const categories = [
    {
      title: 'Cardiovascular',
      icon: 'heart',
      color: '#ef4444',
      items: [
        { label: 'Heart Rate', value: vitals.heart_rate, unit: 'bpm' },
        { label: 'Blood Pressure', value: vitals.blood_pressure, unit: '' },
        { label: 'Mean Arterial Pressure', value: vitals.map, unit: 'mmHg' },
        { label: 'Cardiac Output', value: vitals.cardiac_output, unit: 'L/min' },
        { label: 'Stroke Volume', value: vitals.stroke_volume, unit: 'mL' },
      ],
    },
    {
      title: 'Respiratory',
      icon: 'fitness', // closest to lung
      color: '#38bdf8',
      items: [
        { label: 'Respiration Rate', value: vitals.respiration, unit: 'br/min' },
        { label: 'Oxygen Saturation', value: vitals.spo2, unit: '%' },
        { label: 'Tidal Volume', value: vitals.tidal_volume, unit: 'mL' },
      ],
    },
    {
      title: 'Metabolic & Internal',
      icon: 'flask',
      color: '#f59e0b',
      items: [
        { label: 'Blood Glucose', value: vitals.glucose, unit: 'mg/dL' },
        { label: 'Arterial pH', value: vitals.arterial_ph, unit: 'pH' },
        { label: 'Core Temp', value: vitals.core_temperature, unit: '°C' },
        { label: 'Exercise Intensity', value: (vitals.exercise_level ?? 0) * 100, unit: '%' },
      ],
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Header title={session.name || 'Simulation Results'} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* ── SESSION HEADER INFO ── */}
        <View style={[styles.metaCard, { backgroundColor: c.card }]}>
           <View style={styles.row}>
              <View style={[styles.statusBadge, { backgroundColor: session.has_anomaly ? '#ef444420' : '#10b98120' }]}>
                 <Text style={{ color: session.has_anomaly ? '#ef4444' : '#10b981', fontWeight: '700' }}>
                    {session.has_anomaly ? 'ANOMALY DETECTED' : 'PHYSIOLOGICALLY STABLE'}
                 </Text>
              </View>
              {session.is_automatic && (
                 <View style={[styles.statusBadge, { backgroundColor: '#a78bfa25', marginLeft: 8, borderWidth: 0.5, borderColor: '#a78bfa60' }]}>
                    <Text style={{ color: '#c084fc', fontWeight: '700' }}>
                       🤖 AUTO-RUN
                    </Text>
                 </View>
              )}
           </View>
           <Text style={[styles.timestamp, { color: c.sub }]}>
              Simulated at: {new Date(session.timestamp).toLocaleString()}
           </Text>
        </View>

        {/* ── AI INSIGHTS ── */}
        {session.ai_insights && session.ai_insights.length > 0 && (
          <View style={[styles.insightsCard, { backgroundColor: c.active + '15', borderColor: c.active }]}>
            <Text style={[styles.insightsTitle, { color: c.active }]}>
               <Ionicons name="sparkles" size={16} /> Clinical Insights
            </Text>
            {session.ai_insights.map((insight, idx) => (
              <Text key={idx} style={[styles.insightText, { color: c.text }]}>• {insight}</Text>
            ))}
          </View>
        )}

        {/* ── VITALS GROUPS ── */}
        {categories.map((cat, idx) => (
          <View key={idx} style={styles.categorySection}>
             <View style={styles.categoryHeader}>
                <Ionicons name={cat.icon as any} size={20} color={cat.color} />
                <Text style={[styles.categoryTitle, { color: c.text }]}>{cat.title}</Text>
             </View>
             
             <View style={[styles.vitalsGrid, { backgroundColor: c.card }]}>
                {cat.items.map((item, i) => (
                   <View key={i} style={[styles.vitalRow, i === cat.items.length - 1 && { borderBottomWidth: 0 }]}>
                      <Text style={[styles.vitalLabel, { color: c.sub }]}>{item.label}</Text>
                      <View style={styles.vitalValueGroup}>
                         <Text style={[styles.vitalValue, { color: item.value != null ? c.text : c.sub }]}>
                            {item.value != null ? item.value : '--'}
                         </Text>
                         {item.unit ? <Text style={[styles.vitalUnit, { color: c.sub }]}> {item.unit}</Text> : null}
                      </View>
                   </View>
                ))}
             </View>
          </View>
        ))}

        {/* ── INTERVENTIONS LOGGED ── */}
        {session.events && session.events.length > 0 && (
           <View style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                 <Ionicons name="list" size={20} color={c.active} />
                 <Text style={[styles.categoryTitle, { color: c.text }]}>Sequence of Events</Text>
              </View>
              <View style={[styles.vitalsGrid, { backgroundColor: c.card }]}>
                 {session.events.map((ev, i) => (
                    <View key={i} style={[styles.eventRow, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                       <View style={{ flex: 1 }}>
                          <Text style={[styles.eventLabel, { color: c.text }]}>
                             {ev.event_type.toUpperCase()}
                          </Text>
                          <Text style={[styles.eventDetail, { color: c.sub }]}>
                             Value: {ev.value} {ev.substance_name ? `(${ev.substance_name})` : ''}
                          </Text>
                       </View>
                       {((ev as any).wallTime || ev.timestamp) && (
                          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>
                             {(ev as any).wallTime || new Date((ev.timestamp || 0) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                       )}
                    </View>
                 ))}
              </View>
           </View>
        )}

        <TouchableOpacity 
           style={[styles.backButton, { backgroundColor: c.border }]}
           onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }}
        >
           <Text style={[styles.backButtonText, { color: c.text }]}>Close Results</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  metaCard: { padding: 20, borderRadius: 20, marginBottom: 15 },
  row: { flexDirection: 'row', marginBottom: 10 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  timestamp: { fontSize: 13 },
  insightsCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  insightsTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  insightText: { fontSize: 14, marginBottom: 4, lineHeight: 20 },
  categorySection: { marginBottom: 25 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginLeft: 5 },
  categoryTitle: { fontSize: 16, fontWeight: '700', marginLeft: 10 },
  vitalsGrid: { borderRadius: 20, overflow: 'hidden' },
  vitalRow: { 
     flexDirection: 'row', 
     justifyContent: 'space-between', 
     padding: 16, 
     borderBottomWidth: 1, 
     borderBottomColor: '#ffffff10' 
  },
  vitalLabel: { fontSize: 15, fontWeight: '500' },
  vitalValueGroup: { flexDirection: 'row', alignItems: 'baseline' },
  vitalValue: { fontSize: 16, fontWeight: '700' },
  vitalUnit: { fontSize: 14 },
  eventRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#ffffff10' },
  eventLabel: { fontSize: 14, fontWeight: '700' },
  eventDetail: { fontSize: 12, marginTop: 2 },
  backButton: { padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  backButtonText: { fontSize: 16, fontWeight: '600' },
});
