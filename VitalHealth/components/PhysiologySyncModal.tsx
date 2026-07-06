// components/PhysiologySyncModal.tsx
// Full-featured Deferred Physiology Synchronization UI Modal
// Shows pending events, simulation status, history, and undo controls.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import {
  getSyncStatus,
  runSimulation,
  undoSimulation,
  getSimHistory,
  getDPSSNotifications,
  markNotificationStatus,
  type DPSSSimStatus,
  type DPSSSimHistory,
  type DPSSNotification,
} from '../services/deferredSyncService';

import { log, warn } from '../utils/logger';

// ─── Props ───────────────────────────────────────────────────────────────────

interface PhysiologySyncModalProps {
  visible: boolean;
  userId: string;
  profileName?: string;
  onClose: () => void;
  onSyncComplete?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type TabKey = 'status' | 'history' | 'notifications';

function statusColor(status: string): string {
  switch (status) {
    case 'SUCCESS':  return '#22c55e';
    case 'RUNNING':  return '#f59e0b';
    case 'FAILED':   return '#ef4444';
    case 'UNDONE':   return '#a78bfa';
    default:         return '#94a3b8';
  }
}

function simTypeLabel(type: string): string {
  switch (type) {
    case 'MANUAL':    return '👤 Manual';
    case 'AUTOMATIC': return '🤖 Auto';
    case 'REPLAY':    return '🔁 Replay';
    case 'UNDO':      return '⏪ Undo';
    default:          return type;
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PulsingDot({ active }: { active: boolean }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.5, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(anim, { toValue: 1,   duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active]);

  return (
    <Animated.View style={[styles.dot, { transform: [{ scale: anim }], backgroundColor: active ? '#22c55e' : '#475569' }]} />
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number | null; icon: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PhysiologySyncModal({
  visible,
  userId,
  profileName,
  onClose,
  onSyncComplete,
}: PhysiologySyncModalProps) {
  const [tab, setTab]               = useState<TabKey>('status');
  const [status, setStatus]         = useState<DPSSSimStatus | null>(null);
  const [history, setHistory]       = useState<DPSSSimHistory[]>([]);
  const [notifications, setNotifs]  = useState<DPSSNotification[]>([]);
  const [loading, setLoading]       = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [undoing, setUndoing]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);

  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, bounciness: 4,
      }).start();
      loadAll();
    } else {
      slideAnim.setValue(400);
    }
  }, [visible]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, h, n] = await Promise.allSettled([
        getSyncStatus(userId),
        getSimHistory(userId, 20),
        getDPSSNotifications(userId, 20),
      ]);
      if (s.status === 'fulfilled') setStatus(s.value);
      if (h.status === 'fulfilled') setHistory(h.value.history);
      if (n.status === 'fulfilled') setNotifs(n.value.notifications);
    } catch (e: any) {
      setError('Could not load sync status. Check server connection.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    try {
      await runSimulation(userId, 'user');
      setSuccess('Simulation started! Results will appear shortly.');
      onSyncComplete?.();
      setTimeout(loadAll, 3000);
    } catch (e: any) {
      setError(e.message || 'Simulation failed to start.');
    } finally {
      setSyncing(false);
    }
  }, [userId]);

  const handleUndo = useCallback(async () => {
    setUndoing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await undoSimulation(userId);
      setSuccess(`Rolled back. ${res.events_restored_to_pending} events restored to queue.`);
      loadAll();
    } catch (e: any) {
      setError(e.message || 'Undo failed.');
    } finally {
      setUndoing(false);
    }
  }, [userId]);

  const handleMarkRead = useCallback(async (notifId: string) => {
    try {
      await markNotificationStatus(notifId, 'READ');
      setNotifs(prev => prev.map(n =>
        n.notification_id === notifId ? { ...n, status: 'READ' } : n
      ));
    } catch (e) {
      warn('[DPSS] markRead failed:', e);
    }
  }, []);

  const canSync  = !!(status && status.pending_event_count > 0 && !syncing && !undoing);
  const canUndo  = !!(history.length > 0 && history[0]?.status === 'SUCCESS' && !syncing && !undoing);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>

          {/* Header */}
          <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <PulsingDot active={status?.is_ready_to_simulate ?? false} />
                <Text style={styles.headerTitle}>Physiology Sync</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            {profileName ? <Text style={styles.headerSub}>{profileName}</Text> : null}

            {/* Tabs */}
            <View style={styles.tabs}>
              {(['status', 'history', 'notifications'] as TabKey[]).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tab, tab === t && styles.tabActive]}
                  onPress={() => setTab(t)}
                >
                  <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                    {t === 'status' ? '📊 Status' : t === 'history' ? '📋 History' : '🔔 Alerts'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </LinearGradient>

          {/* Body */}
          <View style={styles.body}>
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={styles.loadingText}>Loading sync data…</Text>
              </View>
            ) : (
              <>
                {/* Error / Success banners */}
                {error   && <View style={styles.errorBanner}><Text style={styles.bannerText}>⚠️ {error}</Text></View>}
                {success && <View style={styles.successBanner}><Text style={styles.bannerText}>✅ {success}</Text></View>}

                {/* ── STATUS TAB ── */}
                {tab === 'status' && status && (
                  <View>
                    <View style={styles.statRow}>
                      <StatCard label="Pending Events"  value={status.pending_event_count}                           icon="📥" />
                      <StatCard label="Last Synced"     value={fmtDate(status.last_simulated_at)}                   icon="🕐" />
                      <StatCard label="Ready to Sync"   value={status.is_ready_to_simulate ? 'Yes ✓' : 'Not yet'}  icon="⚡" />
                    </View>

                    {status.latest_snapshot && (
                      <View style={styles.snapshotBox}>
                        <Text style={styles.snapshotTitle}>Latest Snapshot — {status.latest_snapshot.sim_date}</Text>
                        <View style={styles.vitalsRow}>
                          {status.latest_snapshot.vitals && Object.entries(status.latest_snapshot.vitals)
                            .filter(([, v]) => v !== null && v !== undefined)
                            .slice(0, 4)
                            .map(([key, val]) => (
                              <View key={key} style={styles.vitalChip}>
                                <Text style={styles.vitalVal}>{typeof val === 'number' ? val.toFixed(1) : val}</Text>
                                <Text style={styles.vitalKey}>{key.replace(/_/g, ' ')}</Text>
                              </View>
                            ))
                          }
                        </View>
                      </View>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnPrimary, !canSync && styles.btnDisabled]}
                        onPress={canSync ? handleSync : undefined}
                        disabled={!canSync}
                      >
                        {syncing
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <><Text style={styles.btnIcon}>🚀</Text><Text style={styles.btnText}>Sync Now</Text></>
                        }
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.btn, styles.btnSecondary, !canUndo && styles.btnDisabled]}
                        onPress={canUndo ? handleUndo : undefined}
                        disabled={!canUndo}
                      >
                        {undoing
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <><Text style={styles.btnIcon}>⏪</Text><Text style={styles.btnText}>Undo Last</Text></>
                        }
                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={loadAll}>
                        <Text style={styles.btnIcon}>🔄</Text>
                        <Text style={styles.btnText}>Refresh</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* ── HISTORY TAB ── */}
                {tab === 'history' && (
                  <FlatList
                    data={history}
                    keyExtractor={item => item.sim_id}
                    contentContainerStyle={{ paddingBottom: 16 }}
                    ListEmptyComponent={
                      <Text style={styles.emptyText}>No simulation history yet.</Text>
                    }
                    renderItem={({ item }) => (
                      <View style={styles.historyCard}>
                        <View style={styles.historyHeader}>
                          <Text style={styles.historyType}>{simTypeLabel(item.sim_type)}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '30' }]}>
                            <Text style={[styles.statusBadgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
                          </View>
                        </View>
                        <Text style={styles.historyDate}>{fmtDate(item.started_at)}</Text>
                        {item.duration_ms && (
                          <Text style={styles.historyMeta}>Duration: {(item.duration_ms / 1000).toFixed(1)}s</Text>
                        )}
                        {item.post_vitals?.heart_rate && (
                          <Text style={styles.historyMeta}>
                            HR: {item.post_vitals.heart_rate} bpm · BP: {item.post_vitals.blood_pressure}
                          </Text>
                        )}
                      </View>
                    )}
                  />
                )}

                {/* ── NOTIFICATIONS TAB ── */}
                {tab === 'notifications' && (
                  <FlatList
                    data={notifications}
                    keyExtractor={item => item.notification_id}
                    contentContainerStyle={{ paddingBottom: 16 }}
                    ListEmptyComponent={
                      <Text style={styles.emptyText}>No notifications yet.</Text>
                    }
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.notifCard, item.status === 'UNREAD' && styles.notifUnread]}
                        onPress={() => handleMarkRead(item.notification_id)}
                      >
                        <View style={styles.notifHeader}>
                          <Text style={styles.notifTitle}>{item.payload.title}</Text>
                          {item.status === 'UNREAD' && <View style={styles.unreadDot} />}
                        </View>
                        <Text style={styles.notifBody}>{item.payload.body}</Text>
                        <Text style={styles.notifDate}>{fmtDate(item.created_at)}</Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  headerTitle: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  tabs: {
    flexDirection: 'row',
    marginTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#6366f1',
  },
  tabText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#6366f1',
  },
  body: {
    padding: 16,
    flexGrow: 1,
  },
  center: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: '#64748b',
    fontSize: 14,
  },
  errorBanner: {
    backgroundColor: '#450a0a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  successBanner: {
    backgroundColor: '#052e16',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: {
    color: '#f1f5f9',
    fontSize: 13,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statIcon: { fontSize: 20 },
  statValue: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  statLabel: {
    color: '#64748b',
    fontSize: 10,
    textAlign: 'center',
  },
  snapshotBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  snapshotTitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vitalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vitalChip: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    minWidth: 70,
  },
  vitalVal: { color: '#6366f1', fontSize: 14, fontWeight: '700' },
  vitalKey: { color: '#64748b', fontSize: 9, marginTop: 2 },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 4,
  },
  btnPrimary:   { backgroundColor: '#4f46e5' },
  btnSecondary: { backgroundColor: '#7c3aed' },
  btnGhost:     { backgroundColor: '#1e293b' },
  btnDisabled:  { opacity: 0.4 },
  btnIcon: { fontSize: 14 },
  btnText: { color: '#f1f5f9', fontSize: 12, fontWeight: '700' },
  historyCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyType: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  historyDate: { color: '#64748b', fontSize: 11 },
  historyMeta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  notifCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  notifUnread: {
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notifTitle: { color: '#f1f5f9', fontSize: 14, fontWeight: '600', flex: 1 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#6366f1', marginLeft: 8,
  },
  notifBody: { color: '#94a3b8', fontSize: 12, lineHeight: 17 },
  notifDate: { color: '#475569', fontSize: 10, marginTop: 4 },
  emptyText: {
    color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 30,
  },
});
