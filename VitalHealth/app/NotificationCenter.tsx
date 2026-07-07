// app/NotificationCenter.tsx
import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  Switch,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import Header from "./components/Header";
import { useNotifications } from "../context/NotificationContext";
import { useFamily } from "../context/FamilyContext";
import { useTheme } from "../context/ThemeContext";
import { colors as globalColors } from "../theme/colors";

type TabType = "active" | "unread" | "archived" | "settings";

export default function NotificationCenter() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = globalColors[theme];

  const {
    notifications,
    unreadCount,
    isLoading,
    loadNotifications,
    markRead,
    markAllRead,
    archiveNotification,
    deleteNotification,
    preferences,
    getPrefs,
    updatePrefs,
  } = useNotifications();

  const { members } = useFamily();

  // Navigation / Filter States
  const [activeTab, setActiveTab] = useState<TabType>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedProfile, setSelectedProfile] = useState<string>("all");

  // Per-profile preference manager states
  const [activePrefsProfile, setActivePrefsProfile] = useState<string>("global");

  // Reload notifications on mount
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Categories list
  const categories = [
    { id: "all", label: "All", icon: "grid-outline" },
    { id: "medication", label: "Medicines", icon: "pill-outline" },
    { id: "vitals", label: "Vitals", icon: "pulse-outline" },
    { id: "alerts", label: "Alerts", icon: "warning-outline" },
    { id: "ai", label: "AI Insights", icon: "sparkles-outline" },
    { id: "system", label: "System", icon: "settings-outline" },
  ];

  // Filtered Notifications logic
  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      // 1. Tab filter
      if (activeTab === "unread" && item.readStatus !== 0) return false;
      if (activeTab === "archived" && item.archived !== 1) return false;
      if (activeTab === "active" && item.archived === 1) return false;

      // 2. Category filter
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;

      // 3. Profile filter
      if (selectedProfile !== "all") {
        if (selectedProfile === "self" && item.profileId !== null && item.profileId !== "self") return false;
        if (selectedProfile !== "self" && item.profileId !== selectedProfile) return false;
      }

      // 4. Search text
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(query);
        const matchesMsg = item.message?.toLowerCase().includes(query);
        const matchesProfile = item.profileName?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesMsg && !matchesProfile) return false;
      }

      return true;
    });
  }, [notifications, activeTab, selectedCategory, selectedProfile, searchQuery]);

  // Format timestamp helper
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      
      const diffHrs = Math.floor(diffMins / 60);
      if (diffHrs < 24) return `${diffHrs}h ago`;

      return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  // Haptic feedback handlers
  const handleMarkRead = (id: string, currentStatus: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markRead(id, currentStatus === 0);
  };

  const handleArchive = (id: string, currentArchived: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    archiveNotification(id, currentArchived === 0);
  };

  const handleDelete = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteNotification(id);
  };

  const handleMarkAllRead = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    markAllRead();
  };

  // Preference management
  const [prefLoading, setPrefLoading] = useState(false);
  const [localPrefs, setLocalPrefs] = useState({
    medsEnabled: 1,
    alertsEnabled: 1,
    stepsEnabled: 1,
    hydrationEnabled: 1,
    reportsEnabled: 1,
    twinReminderEnabled: 1,
    muted: 0,
  });

  useEffect(() => {
    if (activeTab !== "settings") return;
    
    async function loadProfilePrefs() {
      setPrefLoading(true);
      const res = await getPrefs(activePrefsProfile);
      setLocalPrefs(res);
      setPrefLoading(false);
    }
    loadProfilePrefs();
  }, [activePrefsProfile, activeTab, getPrefs]);

  const togglePref = async (key: keyof typeof localPrefs) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = {
      ...localPrefs,
      [key]: localPrefs[key] === 1 ? 0 : 1,
    };
    setLocalPrefs(updated);
    await updatePrefs({
      profileId: activePrefsProfile,
      ...updated,
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "#ef4444";
      case "high": return "#f97316";
      case "medium": return "#0ea5e9";
      default: return "#8a99ad";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "medication": return "pill";
      case "vitals": return "pulse";
      case "alerts": return "warning";
      case "appointments": return "calendar";
      case "reports": return "document-text";
      case "family": return "people";
      case "emergency": return "alert-circle";
      case "ai": return "sparkles";
      default: return "notifications";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Header title="Notification Inbox" showBack={true} showProfile={false} />

      <View style={styles.content}>
        {/* Sub-Header Tabs */}
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === "active" && { borderBottomColor: colors.accent }]}
            onPress={() => setActiveTab("active")}
          >
            <Text style={[styles.tabText, { color: activeTab === "active" ? colors.accent : colors.text + "80" }]}>
              Inbox
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === "unread" && { borderBottomColor: colors.accent }]}
            onPress={() => setActiveTab("unread")}
          >
            <View style={styles.unreadTabContainer}>
              <Text style={[styles.tabText, { color: activeTab === "unread" ? colors.accent : colors.text + "80" }]}>
                Unread
              </Text>
              {unreadCount > 0 && (
                <View style={[styles.badgeContainer, { backgroundColor: "#ef4444" }]}>
                  <Text style={styles.badgeText}>{unreadCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === "archived" && { borderBottomColor: colors.accent }]}
            onPress={() => setActiveTab("archived")}
          >
            <Text style={[styles.tabText, { color: activeTab === "archived" ? colors.accent : colors.text + "80" }]}>
              Archived
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === "settings" && { borderBottomColor: colors.accent }]}
            onPress={() => setActiveTab("settings")}
          >
            <Text style={[styles.tabText, { color: activeTab === "settings" ? colors.accent : colors.text + "80" }]}>
              Settings
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab !== "settings" ? (
          <>
            {/* Search and Filters panel */}
            <View style={styles.filterSection}>
              {/* Search bar */}
              <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="search-outline" size={18} color={colors.text + "60"} />
                <TextInput
                  placeholder="Search notifications, members..."
                  placeholderTextColor={colors.text + "60"}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={[styles.searchInput, { color: colors.text }]}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Ionicons name="close-circle" size={18} color={colors.text + "60"} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Profiles Horizontal list */}
              <View style={styles.profileFilterScroll}>
                <TouchableOpacity
                  onPress={() => setSelectedProfile("all")}
                  style={[
                    styles.profilePill,
                    { backgroundColor: selectedProfile === "all" ? colors.accent + "15" : colors.card, borderColor: selectedProfile === "all" ? colors.accent : colors.border }
                  ]}
                >
                  <Text style={[styles.profilePillText, { color: selectedProfile === "all" ? colors.accent : colors.text }]}>
                    All Profiles
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setSelectedProfile("self")}
                  style={[
                    styles.profilePill,
                    { backgroundColor: selectedProfile === "self" ? colors.accent + "15" : colors.card, borderColor: selectedProfile === "self" ? colors.accent : colors.border }
                  ]}
                >
                  <Text style={[styles.profilePillText, { color: selectedProfile === "self" ? colors.accent : colors.text }]}>
                    Self
                  </Text>
                </TouchableOpacity>

                {members.map((member) => (
                  <TouchableOpacity
                    key={member.uid}
                    onPress={() => setSelectedProfile(member.uid)}
                    style={[
                      styles.profilePill,
                      { backgroundColor: selectedProfile === member.uid ? colors.accent + "15" : colors.card, borderColor: selectedProfile === member.uid ? colors.accent : colors.border }
                    ]}
                  >
                    <Text style={[styles.profilePillText, { color: selectedProfile === member.uid ? colors.accent : colors.text }]}>
                      {member.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Categories Horizontal list */}
              <View style={styles.categoryFilterScroll}>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={categories}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => setSelectedCategory(item.id)}
                      style={[
                        styles.catPill,
                        { backgroundColor: selectedCategory === item.id ? colors.accent : colors.card, borderColor: colors.border }
                      ]}
                    >
                      <Ionicons
                        name={item.icon as any}
                        size={14}
                        color={selectedCategory === item.id ? "#ffffff" : colors.text + "90"}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[styles.catPillText, { color: selectedCategory === item.id ? "#ffffff" : colors.text }]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>

              {/* Bulk Actions line */}
              {unreadCount > 0 && activeTab === "active" && (
                <View style={styles.bulkActionRow}>
                  <Text style={[styles.infoText, { color: colors.text + "70" }]}>
                    {unreadCount} unread notification{unreadCount > 1 ? "s" : ""}
                  </Text>
                  <TouchableOpacity onPress={handleMarkAllRead} style={styles.bulkBtn}>
                    <Ionicons name="checkmark-done" size={16} color={colors.accent} style={{ marginRight: 4 }} />
                    <Text style={[styles.bulkBtnText, { color: colors.accent }]}>Mark all read</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Notifications list */}
            {isLoading ? (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
              </View>
            ) : filteredNotifications.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="notifications-off-outline" size={48} color={colors.text + "30"} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.text + "60" }]}>
                  We'll let you know when health updates or medication reminders require your attention.
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredNotifications}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.notificationCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: item.readStatus === 0 ? colors.accent + "30" : colors.border,
                        borderLeftColor: getPriorityColor(item.priority),
                      },
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      {/* Avatar or Icon */}
                      {item.profileId && item.profileId !== "self" ? (
                        <View style={styles.avatarContainer}>
                          {item.profilePhoto ? (
                            <Image source={{ uri: item.profilePhoto }} style={styles.avatarImage} />
                          ) : (
                            <View style={[styles.avatarInitials, { backgroundColor: colors.accent + "10" }]}>
                              <Text style={[styles.avatarText, { color: colors.accent }]}>
                                {item.profileName?.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={[styles.relationshipBadge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                            <Text style={[styles.relationshipText, { color: colors.text + "90" }]}>
                              {item.relationship?.substring(0, 3)}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <View style={[styles.systemIconContainer, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                          <Ionicons
                            name={getCategoryIcon(item.category) as any}
                            size={18}
                            color={getPriorityColor(item.priority)}
                          />
                        </View>
                      )}

                      {/* Content block */}
                      <View style={styles.cardContent}>
                        <View style={styles.titleRow}>
                          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={[styles.timeText, { color: colors.text + "50" }]}>
                            {formatTime(item.timestamp)}
                          </Text>
                        </View>

                        <Text style={[styles.cardMessage, { color: colors.text + "80" }]}>
                          {item.message}
                        </Text>
                      </View>
                    </View>

                    {/* Footer Actions */}
                    <View style={[styles.cardActions, { borderTopColor: colors.border + "40" }]}>
                      <View style={styles.metaRow}>
                        <View style={[styles.priorityPill, { backgroundColor: getPriorityColor(item.priority) + "10" }]}>
                          <Text style={[styles.priorityText, { color: getPriorityColor(item.priority) }]}>
                            {item.priority}
                          </Text>
                        </View>
                        {item.profileName && (
                          <View style={[styles.profilePillBadge, { backgroundColor: colors.accent + "10", marginLeft: 6 }]}>
                            <Text style={[styles.profilePillBadgeText, { color: colors.accent }]}>
                              👤 {item.profileName} {item.relationship ? `(${item.relationship})` : ""}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.actionButtonsRow}>
                        {/* Deep link action button */}
                        {item.deepLink && (
                          <TouchableOpacity
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              router.push(item.deepLink as any);
                            }}
                            style={[styles.actionBtn, { backgroundColor: colors.accent + "10" }]}
                          >
                            <Ionicons name="arrow-forward" size={14} color={colors.accent} />
                            <Text style={[styles.actionBtnText, { color: colors.accent }]}>View</Text>
                          </TouchableOpacity>
                        )}

                        {/* Read/Unread toggler */}
                        <TouchableOpacity
                          onPress={() => handleMarkRead(item.id, item.readStatus)}
                          style={[styles.iconActionBtn, { borderColor: colors.border }]}
                        >
                          <Ionicons
                            name={item.readStatus === 0 ? "mail-open-outline" : "mail-outline"}
                            size={16}
                            color={colors.text + "80"}
                          />
                        </TouchableOpacity>

                        {/* Archive button */}
                        <TouchableOpacity
                          onPress={() => handleArchive(item.id, item.archived)}
                          style={[styles.iconActionBtn, { borderColor: colors.border }]}
                        >
                          <Ionicons
                            name={item.archived === 0 ? "archive-outline" : "refresh-outline"}
                            size={16}
                            color={colors.text + "80"}
                          />
                        </TouchableOpacity>

                        {/* Delete button */}
                        <TouchableOpacity
                          onPress={() => handleDelete(item.id)}
                          style={[styles.iconActionBtn, { borderColor: "#ef4444" + "20" }]}
                        >
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              />
            )}
          </>
        ) : (
          /* Profile Preferences Manager Panel */
          <FlatList
            data={[]}
            renderItem={null}
            ListHeaderComponent={() => (
              <View style={styles.settingsContainer}>
                <Text style={[styles.settingsTitle, { color: colors.text }]}>
                  Per-Profile Notification Rules
                </Text>
                <Text style={[styles.settingsSubtitle, { color: colors.text + "70" }]}>
                  Define which categories of health updates you receive alerts for, customized per family member.
                </Text>

                {/* Profile selector tab */}
                <View style={styles.prefsProfileSelector}>
                  <TouchableOpacity
                    style={[
                      styles.prefsProfileTab,
                      activePrefsProfile === "global" && { backgroundColor: colors.accent, borderColor: colors.accent }
                    ]}
                    onPress={() => setActivePrefsProfile("global")}
                  >
                    <Text style={[styles.prefsProfileTabText, { color: activePrefsProfile === "global" ? "#ffffff" : colors.text }]}>
                      Global Defaults
                    </Text>
                  </TouchableOpacity>

                  {members.map((m) => (
                    <TouchableOpacity
                      key={m.uid}
                      style={[
                        styles.prefsProfileTab,
                        activePrefsProfile === m.uid && { backgroundColor: colors.accent, borderColor: colors.accent }
                      ]}
                      onPress={() => setActivePrefsProfile(m.uid)}
                    >
                      <Text style={[styles.prefsProfileTabText, { color: activePrefsProfile === m.uid ? "#ffffff" : colors.text }]}>
                        {m.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {prefLoading ? (
                  <View style={{ padding: 40, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={colors.accent} />
                  </View>
                ) : (
                  <View style={[styles.prefsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.prefRow}>
                      <View>
                        <Text style={[styles.prefLabel, { color: colors.text }]}>Mute All Alerts</Text>
                        <Text style={[styles.prefSub, { color: colors.text + "60" }]}>
                          Temporarily silence all notifications
                        </Text>
                      </View>
                      <Switch value={localPrefs.muted === 1} onValueChange={() => togglePref("muted")} />
                    </View>

                    <View style={[styles.prefDivider, { backgroundColor: colors.border }]} />

                    <View style={[styles.prefRow, localPrefs.muted === 1 && { opacity: 0.5 }]}>
                      <View>
                        <Text style={[styles.prefLabel, { color: colors.text }]}>Medication Compliance</Text>
                        <Text style={[styles.prefSub, { color: colors.text + "60" }]}>
                          Alerts when medicines are taken or missed
                        </Text>
                      </View>
                      <Switch
                        disabled={localPrefs.muted === 1}
                        value={localPrefs.medsEnabled === 1}
                        onValueChange={() => togglePref("medsEnabled")}
                      />
                    </View>

                    <View style={[styles.prefDivider, { backgroundColor: colors.border }]} />

                    <View style={[styles.prefRow, localPrefs.muted === 1 && { opacity: 0.5 }]}>
                      <View>
                        <Text style={[styles.prefLabel, { color: colors.text }]}>Critical Health Alerts</Text>
                        <Text style={[styles.prefSub, { color: colors.text + "60" }]}>
                          Hypoxia (SpO₂), high temperature, or heart alerts
                        </Text>
                      </View>
                      <Switch
                        disabled={localPrefs.muted === 1}
                        value={localPrefs.alertsEnabled === 1}
                        onValueChange={() => togglePref("alertsEnabled")}
                      />
                    </View>

                    <View style={[styles.prefDivider, { backgroundColor: colors.border }]} />

                    <View style={[styles.prefRow, localPrefs.muted === 1 && { opacity: 0.5 }]}>
                      <View>
                        <Text style={[styles.prefLabel, { color: colors.text }]}>Hydration Logging</Text>
                        <Text style={[styles.prefSub, { color: colors.text + "60" }]}>
                          Alerts when water consumption is updated
                        </Text>
                      </View>
                      <Switch
                        disabled={localPrefs.muted === 1}
                        value={localPrefs.hydrationEnabled === 1}
                        onValueChange={() => togglePref("hydrationEnabled")}
                      />
                    </View>

                    <View style={[styles.prefDivider, { backgroundColor: colors.border }]} />

                    <View style={[styles.prefRow, localPrefs.muted === 1 && { opacity: 0.5 }]}>
                      <View>
                        <Text style={[styles.prefLabel, { color: colors.text }]}>Activity & Sync Alerts</Text>
                        <Text style={[styles.prefSub, { color: colors.text + "60" }]}>
                          Reminders to perform weekly twin backups
                        </Text>
                      </View>
                      <Switch
                        disabled={localPrefs.muted === 1}
                        value={localPrefs.twinReminderEnabled === 1}
                        onValueChange={() => togglePref("twinReminderEnabled")}
                      />
                    </View>
                  </View>
                )}
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 110,
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
  },
  unreadTabContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  badgeContainer: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "bold",
  },
  filterSection: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    paddingVertical: 0,
  },
  profileFilterScroll: {
    flexDirection: "row",
    marginBottom: 8,
  },
  profilePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  profilePillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  categoryFilterScroll: {
    marginBottom: 10,
  },
  catPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  catPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  bulkActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  infoText: {
    fontSize: 12,
  },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  bulkBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  notificationCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 5,
    marginBottom: 12,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
  },
  avatarContainer: {
    position: "relative",
    marginRight: 12,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarInitials: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  relationshipBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 3,
    paddingVertical: 0.5,
  },
  relationshipText: {
    fontSize: 7,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  systemIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    fontSize: 10,
    fontWeight: "500",
  },
  cardMessage: {
    fontSize: 12,
    lineHeight: 16,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  actionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 3,
  },
  iconActionBtn: {
    borderWidth: 1,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  settingsContainer: {
    padding: 16,
  },
  settingsTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  settingsSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  prefsProfileSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  prefsProfileTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#8a99ad40",
    marginRight: 8,
    marginBottom: 8,
  },
  prefsProfileTabText: {
    fontSize: 12,
    fontWeight: "600",
  },
  prefsCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  prefRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  prefLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  prefSub: {
    fontSize: 11,
  },
  prefDivider: {
    height: 1,
    width: "100%",
  },
  profilePillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  profilePillBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
});
