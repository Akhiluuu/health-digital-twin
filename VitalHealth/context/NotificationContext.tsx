// context/NotificationContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { NativeModules } from "react-native";
let notifee: any = { displayNotification: async () => {}, createChannel: async () => {} };
let AndroidImportance: any = { HIGH: 4 };
if (Boolean(NativeModules?.NotifeeApiModule)) {
  try {
    const NotifeeModule = require("@notifee/react-native");
    if (NotifeeModule.default) notifee = NotifeeModule.default;
    if (NotifeeModule.AndroidImportance) AndroidImportance = NotifeeModule.AndroidImportance;
  } catch (e) {}
}
import { doc, onSnapshot, collection } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { getUserId } from "../services/firebaseSync";
import {
  NotificationItem,
  NotificationPrefs,
  addNotificationDB,
  getNotificationsDB,
  markNotificationReadDB,
  markAllNotificationsReadDB,
  markNotificationsReadByCategoryDB,
  markNotificationsReadByDeepLinkDB,
  archiveNotificationDB,
  deleteNotificationDB,
  getNotificationPrefsDB,
  updateNotificationPrefsDB,
  DEFAULT_PREFS
} from "../database/notificationDB";
import { useFamily } from "./FamilyContext";
import { useProfile } from "./ProfileContext";
import { log, error } from "../utils/logger";
import { notificationEventBus } from "../services/notifeeService";
import { getLocalDateString } from "../utils/twinUtils";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  loadNotifications: (query?: string) => Promise<void>;
  syncNotifications: () => Promise<void>;
  addNotification: (item: Omit<NotificationItem, "readStatus" | "archived">) => Promise<void>;
  markRead: (id: string, read?: boolean) => Promise<void>;
  markAllRead: () => Promise<void>;
  markReadByCategory: (category: string) => Promise<void>;
  markReadByDeepLink: (deepLink: string) => Promise<void>;
  archiveNotification: (id: string, archived?: boolean) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  
  // Preferences
  preferences: Record<string, NotificationPrefs>;
  getPrefs: (profileId: string) => Promise<NotificationPrefs>;
  updatePrefs: (prefs: NotificationPrefs) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

const CHANNEL_ID = "health_critical";

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile: selfProfile } = useProfile();
  const { switchToMember, switchToSelf, activeMemberId } = useFamily();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const notificationsRef = useRef<NotificationItem[]>([]);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const [preferences, setPreferences] = useState<Record<string, NotificationPrefs>>({});
  const [isLoading, setIsLoading] = useState(true);
  
  const { members } = useFamily();
  const activeUnsubscribes = useRef<(() => void)[]>([]);

  // Track state transitions to avoid duplicate notifications (e.g. memberId_medicineId -> lastTakenState)
  const lastMedicineStates = useRef<Record<string, number>>({});
  const lastVitalAlerts = useRef<Record<string, { spo2Time: number; hrTime: number }>>({});
  const lastVitalsValue = useRef<Record<string, { spo2: number; heartRate: number }>>({});

  const unreadCount = notifications.filter(n => n.readStatus === 0).length;

  /**
   * Load notifications from SQLite
   */
  const loadNotifications = useCallback(async (query?: string) => {
    try {
      const list = await getNotificationsDB({ query });
      setNotifications(list);
    } catch (err) {
      error("❌ [NotificationContext] loadNotifications error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Add a notification with smart 5-minute grouping and haptic warnings
   */
  const addNotification = useCallback(async (
    item: Omit<NotificationItem, "readStatus" | "archived">
  ): Promise<void> => {
    try {
      // 1. Fetch preferences for this profile (or global)
      const targetProfileId = item.profileId || "global";
      const prefs = await getNotificationPrefsDB(targetProfileId);
      
      // If globally muted or specific channel is disabled, ignore
      if (prefs.muted) {
        log(`[NotificationContext] Blocked notification (muted): ${item.title}`);
        return;
      }
      
      if (item.category === "medication" && !prefs.medsEnabled) return;
      if (item.category === "vitals" && !prefs.hydrationEnabled && item.title.toLowerCase().includes("hydration")) return; // share hydration setting
      if (item.category === "alerts" && !prefs.alertsEnabled) return;
      if (item.category === "reports" && !prefs.reportsEnabled) return;
      if (item.category === "ai" && !prefs.reportsEnabled) return; // group AI under reports
      if (item.category === "system" && targetProfileId === "global" && !prefs.twinReminderEnabled) return;

      // Format title with profile name if not already formatted
      let formattedTitle = item.title;
      const resolvedName = item.profileName || (item.profileId === "self" ? (selfProfile?.firstName || "Me") : "");
      if (resolvedName && !formattedTitle.startsWith("[")) {
        let cleanBase = formattedTitle;
        const namePrefixPattern = new RegExp(`^(✓|❌|⚠️|🚨)?\\s*${resolvedName}\\s*`, "i");
        const match = cleanBase.match(namePrefixPattern);
        if (match) {
          const emoji = match[1] || "";
          cleanBase = cleanBase.replace(namePrefixPattern, "").trim();
          if (emoji) {
            cleanBase = `${emoji} ${cleanBase}`;
          }
        }
        formattedTitle = `[${resolvedName}] ${cleanBase}`;
      }

      // 2. Smart Grouping: Check if multiple medicines are taken/missed within 5 minutes
      if (item.category === "medication" && item.profileId) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const activeMedsInWindow = notifications.filter(n => 
          n.profileId === item.profileId &&
          n.category === "medication" &&
          n.timestamp >= fiveMinutesAgo &&
          n.readStatus === 0
        );

        if (activeMedsInWindow.length > 0) {
          // Found a recent unread medication notification to group into
          const baseNotif = activeMedsInWindow[0];
          
          // Parse how many medicines were completed/logged
          let currentList = [item.title];
          // Try to extract existing medicine names from title/message
          const listMatch = baseNotif.message.match(/\(([^)]+)\)/);
          if (listMatch) {
            currentList = [...listMatch[1].split(", "), item.title];
          } else {
            // If it was just a single medicine description, extract the medicine name
            const singleName = baseNotif.title.replace("✓ ", "").replace("❌ ", "").split(" has ")[0];
            const prevMed = baseNotif.message.split(" taken ")[1] || baseNotif.message.split(" missed ")[1] || "";
            if (prevMed) {
              currentList = [prevMed, item.title];
            }
          }

          // Deduplicate names
          const uniqueList = Array.from(new Set(currentList));
          const count = uniqueList.length;
          
          const groupTitle = `[${resolvedName || item.profileName}] Activity`;
          const groupMessage = `✓ ${resolvedName || item.profileName} completed ${count} medicines (${uniqueList.join(", ")}).`;
          
          // Update SQLite
          const { db } = require("../database/index");
          await db.runAsync(
            `UPDATE notifications SET title = ?, message = ?, timestamp = ? WHERE id = ?`,
            [groupTitle, groupMessage, item.timestamp, baseNotif.id]
          );
          
          // Update push notification
          await notifee.displayNotification({
            id: baseNotif.id,
            title: groupTitle,
            body: groupMessage,
            data: {
              profileId: item.profileId || "self",
              profileName: resolvedName || "",
              deepLink: item.deepLink || "",
              type: item.category || "",
            },
            android: {
              channelId: CHANNEL_ID,
              pressAction: { id: "default" },
            },
          });
          
          log(`[NotificationContext] Grouped notification for ${item.profileName}`);
          await loadNotifications();
          return;
        }
      }

      // 3. Trigger Local Push Notification via Notifee
      await notifee.displayNotification({
        id: item.id,
        title: formattedTitle,
        body: item.message,
        data: {
          profileId: item.profileId || "self",
          profileName: resolvedName || "",
          deepLink: item.deepLink || "",
          type: item.category || "",
        },
        android: {
          channelId: CHANNEL_ID,
          pressAction: {
            id: "default",
          },
        },
      });

      // 4. Trigger Haptic Alerts on the device (Immediate/Caregiver scenarios)
      if (item.priority === "critical") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (item.priority === "high") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (item.priority === "medium") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // 5. Store in SQLite & Reload
      await addNotificationDB({ ...item, title: formattedTitle });
      await loadNotifications();
    } catch (err) {
      error("❌ [NotificationContext] addNotification error:", err);
    }
  }, [notifications, loadNotifications, selfProfile]);

  /**
   * Mark a single notification as read
   */
  const markRead = async (id: string, read: boolean = true) => {
    try {
      await markNotificationReadDB(id, read);
      await loadNotifications();
    } catch (err) {
      error("❌ [NotificationContext] markRead error:", err);
    }
  };

  /**
   * Mark all active notifications as read
   */
  const markAllRead = async () => {
    try {
      await markAllNotificationsReadDB();
      await loadNotifications();
    } catch (err) {
      error("❌ [NotificationContext] markAllRead error:", err);
    }
  };

  /**
   * Mark read by category (automatic screen focus trigger)
   */
  const markReadByCategory = async (category: string) => {
    try {
      await markNotificationsReadByCategoryDB(category);
      await loadNotifications();
    } catch (err) {
      error("❌ [NotificationContext] markReadByCategory error:", err);
    }
  };

  /**
   * Mark read by deep link (automatic screen focus trigger)
   */
  const markReadByDeepLink = async (deepLink: string) => {
    try {
      await markNotificationsReadByDeepLinkDB(deepLink);
      await loadNotifications();
    } catch (err) {
      error("❌ [NotificationContext] markReadByDeepLink error:", err);
    }
  };

  /**
   * Archive a notification
   */
  const archiveNotification = async (id: string, archived: boolean = true) => {
    try {
      await archiveNotificationDB(id, archived);
      await loadNotifications();
    } catch (err) {
      error("❌ [NotificationContext] archiveNotification error:", err);
    }
  };

  /**
   * Permanently delete a notification
   */
  const deleteNotification = async (id: string) => {
    try {
      await deleteNotificationDB(id);
      await loadNotifications();
    } catch (err) {
      error("❌ [NotificationContext] deleteNotification error:", err);
    }
  };

  /**
   * Preferences
   */
  const getPrefs = async (profileId: string): Promise<NotificationPrefs> => {
    const cached = preferences[profileId];
    if (cached) return cached;
    const res = await getNotificationPrefsDB(profileId);
    setPreferences(prev => ({ ...prev, [profileId]: res }));
    return res;
  };

  const updatePrefs = async (prefs: NotificationPrefs) => {
    try {
      await updateNotificationPrefsDB(prefs);
      setPreferences(prev => ({ ...prev, [prefs.profileId]: prefs }));
    } catch (err) {
      error("❌ [NotificationContext] updatePrefs error:", err);
    }
  };

  /**
   * Set up real-time observers for family member activities (Caregiver / Sync Pipeline)
   */
  useEffect(() => {
    let active = true;

    const initObservers = async () => {
      const parentUid = await getUserId();
      if (!active) return;

      // Clean up any existing listeners
      activeUnsubscribes.current.forEach(unsub => unsub());
      activeUnsubscribes.current = [];

      const profilesToObserve = [...members];
      if (parentUid && selfProfile) {
        // Only add if not already in members
        if (!members.some(m => m.uid === parentUid)) {
          profilesToObserve.push({
            uid: parentUid,
            name: selfProfile.firstName ? `${selfProfile.firstName} ${selfProfile.lastName || ""}`.trim() : "You",
            relationship: "Self",
            profileImage: selfProfile.profileImage || null,
            relation: "Self"
          } as any);
        }
      }

      if (profilesToObserve.length === 0) return;

      log(`[NotificationContext] Initializing observers for ${profilesToObserve.length} profiles (including self)`);

      profilesToObserve.forEach(member => {
        if (!member.uid) return;

        // Initialize state placeholders
        if (!lastVitalAlerts.current[member.uid]) {
          lastVitalAlerts.current[member.uid] = { spo2Time: 0, hrTime: 0 };
        }

        // ── 1. Observe Family Member Vitals / Anomaly Detection ────────
        const profileUnsub = onSnapshot(
          doc(db, "users", member.uid),
          (snapshot) => {
            if (!snapshot.exists()) return;
            const data = snapshot.data();
            
            const prev = lastVitalsValue.current[member.uid] || { spo2: 98, heartRate: 75 };
            const curSpo2 = data.spo2 !== undefined ? data.spo2 : 0;
            const curHR = data.heartRate !== undefined ? Math.round(data.heartRate) : 0;
            
            lastVitalsValue.current[member.uid] = { spo2: curSpo2 || prev.spo2, heartRate: curHR || prev.heartRate };

            const alertState = lastVitalAlerts.current[member.uid] || { spo2Time: 0, hrTime: 0 };
            const now = Date.now();

            // A. SpO₂ Anomalies (Hypoxia detection)
            if (curSpo2 > 0 && curSpo2 < 95 && (now - alertState.spo2Time > 15 * 60 * 1000)) {
              // Trigger critical hypoxia notification
              lastVitalAlerts.current[member.uid].spo2Time = now;
              addNotification({
                id: `alert_spo2_${member.uid}_${now}`,
                title: `🚨 Low Oxygen Alert`,
                message: `${member.name}'s oxygen saturation level dropped to a critical ${curSpo2}%. Please check on them immediately.`,
                profileId: member.uid === parentUid ? "self" : member.uid,
                profileName: member.name ?? null,
                relationship: member.relationship || member.relation || "Family",
                profilePhoto: member.profileImage || null,
                category: "alerts",
                priority: "critical",
                timestamp: new Date().toISOString(),
                deepLink: member.uid === parentUid ? "/(tabs)/twin" : `/family/member-details?id=${member.uid}`,
                actionButtons: JSON.stringify([{ id: "view", title: "View Vitals" }]),
              });
            }

            // B. Heart Rate Anomalies (Tachycardia / Bradycardia)
            if (curHR > 0 && (curHR > 120 || curHR < 50) && (now - alertState.hrTime > 15 * 60 * 1000)) {
              lastVitalAlerts.current[member.uid].hrTime = now;
              const issue = curHR > 120 ? "abnormally high heart rate (Tachycardia)" : "abnormally low heart rate (Bradycardia)";
              addNotification({
                id: `alert_hr_${member.uid}_${now}`,
                title: `⚠️ Abnormal Heart Rate`,
                message: `${member.name} has an ${issue} of ${curHR} BPM.`,
                profileId: member.uid === parentUid ? "self" : member.uid,
                profileName: member.name ?? null,
                relationship: member.relationship || member.relation || "Family",
                profilePhoto: member.profileImage || null,
                category: "alerts",
                priority: "high",
                timestamp: new Date().toISOString(),
                deepLink: member.uid === parentUid ? "/(tabs)/twin" : `/family/member-details?id=${member.uid}`,
                actionButtons: JSON.stringify([{ id: "view", title: "View Vitals" }]),
              });
            }
          },
          (err) => {
            error(`[NotificationContext] Error monitoring profile for ${member.name}:`, err);
          }
        );

        // ── 2. Observe Family Member Medication Actions (Requirement 1) ──
        const medicineUnsub = onSnapshot(
          collection(db, "users", member.uid, "medicines"),
          (snapshot) => {
            snapshot.docChanges().forEach(change => {
              if (change.type === "modified") {
                const med = change.doc.data();
                const medIdStr = change.doc.id;
                const key = `${member.uid}_${medIdStr}`;
                
                const prevTaken = lastMedicineStates.current[key] !== undefined ? lastMedicineStates.current[key] : 0;
                const curTaken = med.taken !== undefined ? med.taken : 0;
                
                lastMedicineStates.current[key] = curTaken;

                // Only trigger if status transitioned from pending/unset to Taken (1) or Missed (-1) today
                const today = getLocalDateString();
                const mDate = med.takenDate && med.takenDate.includes("T") ? med.takenDate.split("T")[0] : med.takenDate;
                const isToday = mDate === today;

                if (isToday) {
                  if (curTaken === 1 && prevTaken !== 1) {
                    // ✓ Taken Notification
                    addNotification({
                      id: `med_taken_${key}_${Date.now()}`,
                      title: `✓ ${member.name} Medicine Taken`,
                      message: `${member.name} has taken ${med.name || "medication"}.`,
                      profileId: member.uid === parentUid ? "self" : member.uid,
                      profileName: member.name ?? null,
                      relationship: member.relationship || member.relation || "Family",
                      profilePhoto: member.profileImage || null,
                      category: "medication",
                      priority: "medium",
                      timestamp: new Date().toISOString(),
                      deepLink: member.uid === parentUid ? "/MedicationVault" : `/family/member-details?id=${member.uid}`,
                      actionButtons: null,
                    });
                  } else if (curTaken === -1 && prevTaken !== -1) {
                    // ❌ Missed Notification
                    addNotification({
                      id: `med_missed_${key}_${Date.now()}`,
                      title: `❌ ${member.name} Medicine Missed`,
                      message: `${member.name} missed scheduled dose of ${med.name || "medication"}.`,
                      profileId: member.uid === parentUid ? "self" : member.uid,
                      profileName: member.name ?? null,
                      relationship: member.relationship || member.relation || "Family",
                      profilePhoto: member.profileImage || null,
                      category: "medication",
                      priority: "high",
                      timestamp: new Date().toISOString(),
                      deepLink: member.uid === parentUid ? "/MedicationVault" : `/family/member-details?id=${member.uid}`,
                      actionButtons: null,
                    });
                  }
                }
              }
            });
          },
          (err) => {
            error(`[NotificationContext] Error monitoring medicines for ${member.name}:`, err);
          }
        );

        activeUnsubscribes.current.push(profileUnsub, medicineUnsub);
      });
    };

    initObservers();

    return () => {
      active = false;
      activeUnsubscribes.current.forEach(unsub => unsub());
    };
  }, [members, selfProfile, addNotification]);

  // Initial load
  useEffect(() => {
    notifee.createChannel({
      id: CHANNEL_ID,
      name: "Critical Health Alerts",
      importance: AndroidImportance.HIGH,
      vibration: true,
    }).catch(err => console.log("Failed to create critical channel:", err));
    
    loadNotifications();
  }, [loadNotifications]);

  // Handle Notification Tap -> Auto Profile Switch & Deep Link Navigation
  useEffect(() => {
    if (!notifee || !notifee.onForegroundEvent) return;

    const handleNotificationTap = async (data: any) => {
      if (!data) return;
      const targetProfileId = data.profileId;
      const targetDeepLink = data.deepLinkUrl || data.deepLink;

      log("🔔 Notification Tapped Payload:", { targetProfileId, targetDeepLink });

      if (targetProfileId) {
        if (targetProfileId === "self") {
          await switchToSelf();
        } else if (targetProfileId !== activeMemberId) {
          await switchToMember(targetProfileId);
        }
      }

      if (targetDeepLink && targetDeepLink.length > 0) {
        try {
          router.push(targetDeepLink as any);
        } catch (e) {
          log("⚠️ Deep link navigation fallback error:", e);
        }
      }
    };

    const unsubscribe = notifee.onForegroundEvent(async ({ type, detail }: any) => {
      if (type === 1 /* EventType.PRESS */) {
        if (detail.notification?.data) {
          await handleNotificationTap(detail.notification.data);
        }
      }
    });

    notifee.getInitialNotification?.().then(async (initialNotif: any) => {
      if (initialNotif?.notification?.data) {
        await handleNotificationTap(initialNotif.notification.data);
      }
    }).catch(() => {});

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [activeMemberId, switchToMember, switchToSelf]);

  // Listen to incoming delivered notifications to reload local DB state in real-time
  useEffect(() => {
    const handleNotificationReceived = () => {
      loadNotifications();
    };
    notificationEventBus.on("notification_received", handleNotificationReceived);
    return () => {
      notificationEventBus.off("notification_received", handleNotificationReceived);
    };
  }, [loadNotifications]);

  const syncDPSSNotifications = useCallback(async () => {
    try {
      if (!selfProfile) return;

      const { getTwinId } = require("../utils/twinUtils");
      const { getDPSSNotifications } = require("../services/deferredSyncService");
      const {
        showPhysioSyncReady,
        showAutoSyncCompleted,
        showSimFailed
      } = require("../services/notifeeService");

      // 1. Gather all profile Twin IDs
      const profilesToCheck = [
        {
          id: "self",
          name: selfProfile.firstName ? `${selfProfile.firstName} ${selfProfile.lastName || ""}`.trim() : "You",
          twinId: getTwinId(selfProfile),
          relationship: "Self",
          photo: selfProfile.profileImage || null
        },
        ...members.map(m => ({
          id: m.uid,
          name: m.name || `${m.firstName || ""} ${m.lastName || ""}`.trim() || "Family Member",
          twinId: getTwinId(m),
          relationship: m.relationship || m.relation || "Family",
          photo: m.profileImage || null
        }))
      ];

      for (const target of profilesToCheck) {
        if (!target.twinId || target.twinId === "temp_user") continue;

        try {
          const res = await getDPSSNotifications(target.twinId, 10);
          if (res && res.notifications) {
            for (const notif of res.notifications) {
              // Only process UNREAD notifications
              if (notif.status !== "UNREAD") continue;

              const localId = `dpss_${notif.notification_id}`;

              // Check if we already have it in local notifications to avoid duplicate alerts
              const alreadyExists = notificationsRef.current.some(n => n.id === localId);
              if (alreadyExists) continue;

              // Display the system push notification
              const resolvedName = target.name || (target.id === "self" ? (selfProfile?.firstName || "Me") : "");
              let formattedTitle = notif.payload?.title || "Digital Twin Sync Alert";
              if (resolvedName && !formattedTitle.startsWith("[")) {
                formattedTitle = `[${resolvedName}] ${formattedTitle}`;
              }
              const body = notif.payload?.body || "Update available.";

              if (notif.notif_type === "SIM_READY" || notif.notif_type === "MULTIPLE_PENDING") {
                await showPhysioSyncReady(
                  notif.payload?.pending_count || 1,
                  target.twinId,
                  localId,
                  formattedTitle,
                  body,
                  target.id
                );
              } else if (notif.notif_type === "AUTO_COMPLETED") {
                await showAutoSyncCompleted(
                  target.twinId,
                  notif.sim_date,
                  formattedTitle,
                  body,
                  target.id
                );
              } else if (notif.notif_type === "SIM_FAILED") {
                await showSimFailed(
                  target.twinId,
                  notif.sim_date,
                  formattedTitle,
                  body,
                  target.id
                );
              } else {
                // Generic display
                await notifee.displayNotification({
                  id: localId,
                  title: formattedTitle,
                  body,
                  data: {
                    type: "dpss_sync",
                    userId: target.twinId,
                    profileId: target.id,
                    action: "open_twin",
                  },
                  android: {
                    channelId: CHANNEL_ID,
                    pressAction: { id: "default" },
                  }
                });
              }

              // Add it to the local SQLite database so it appears in the Notification Inbox (NotificationCenter)
              await addNotificationDB({
                id: localId,
                title: formattedTitle,
                message: body,
                profileId: target.id,
                profileName: target.name,
                relationship: target.relationship,
                profilePhoto: target.photo,
                category: "ai",
                priority: notif.notif_type === "SIM_FAILED" ? "high" : "medium",
                timestamp: notif.created_at || new Date().toISOString(),
                deepLink: target.id === "self" ? "/profile" : `/family/member-details?id=${target.id}`,
                actionButtons: null
              });
            }
          }
        } catch (err) {
          log(`[NotificationContext] Error syncing DPSS notifications for ${target.name}:`, err);
        }
      }

      // Reload notifications to refresh the list in state
      await loadNotifications();

    } catch (e) {
      error("[NotificationContext] syncDPSSNotifications outer error:", e);
    }
  }, [selfProfile, members, loadNotifications]);

  const syncNotifications = useCallback(async () => {
    // Run DPSS sync and reload local notifications in background without blocking UI
    await syncDPSSNotifications();
    await loadNotifications();
  }, [syncDPSSNotifications, loadNotifications]);

  // Poll for DPSS notifications
  const syncDPSSNotificationsRef = useRef(syncDPSSNotifications);
  useEffect(() => {
    syncDPSSNotificationsRef.current = syncDPSSNotifications;
  }, [syncDPSSNotifications]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      syncDPSSNotificationsRef.current();
    }

    const interval = setInterval(() => {
      const currentUid = auth.currentUser?.uid;
      if (currentUid) {
        syncDPSSNotificationsRef.current();
      }
    }, 180000); // Poll every 3 minutes

    return () => clearInterval(interval);
  }, [auth.currentUser?.uid]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        loadNotifications,
        syncNotifications,
        addNotification,
        markRead,
        markAllRead,
        markReadByCategory,
        markReadByDeepLink,
        archiveNotification,
        deleteNotification,
        preferences,
        getPrefs,
        updatePrefs,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
};
