// database/notificationDB.ts
import { db } from "./index";
import { log, error } from "../utils/logger";

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  profileId: string | null;
  profileName: string | null;
  relationship: string | null;
  profilePhoto: string | null;
  category: "medication" | "vitals" | "alerts" | "appointments" | "reports" | "family" | "emergency" | "system" | "ai";
  priority: "critical" | "high" | "medium" | "low";
  timestamp: string;
  deepLink: string | null;
  actionButtons: string | null; // JSON string
  readStatus: number; // 0 = Unread, 1 = Read
  archived: number; // 0 = Active, 1 = Archived
}

export interface NotificationPrefs {
  profileId: string;
  medsEnabled: number;
  alertsEnabled: number;
  stepsEnabled: number;
  hydrationEnabled: number;
  reportsEnabled: number;
  twinReminderEnabled: number;
  muted: number;
}

export const DEFAULT_PREFS = (profileId: string): NotificationPrefs => ({
  profileId,
  medsEnabled: 1,
  alertsEnabled: 1,
  stepsEnabled: 1,
  hydrationEnabled: 1,
  reportsEnabled: 1,
  twinReminderEnabled: 1,
  muted: 0,
});

/**
 * Add a new notification to the SQLite database
 */
export const addNotificationDB = async (
  item: Omit<NotificationItem, "readStatus" | "archived">
): Promise<void> => {
  try {
    await db.runAsync(
      `INSERT INTO notifications (
        id, title, message, profileId, profileName, relationship,
        profilePhoto, category, priority, timestamp, deepLink, actionButtons,
        readStatus, archived
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [
        item.id,
        item.title,
        item.message,
        item.profileId,
        item.profileName,
        item.relationship,
        item.profilePhoto,
        item.category,
        item.priority,
        item.timestamp,
        item.deepLink,
        item.actionButtons,
      ]
    );
    log(`[notificationDB] Added notification: ${item.title}`);
  } catch (err) {
    error("❌ [notificationDB] addNotificationDB error:", err);
    throw err;
  }
};

/**
 * Fetch notifications with optional filters
 */
export const getNotificationsDB = async (options?: {
  unreadOnly?: boolean;
  archived?: boolean;
  category?: string;
  query?: string;
}): Promise<NotificationItem[]> => {
  try {
    let queryStr = `SELECT * FROM notifications WHERE 1=1`;
    const params: any[] = [];

    if (options?.unreadOnly) {
      queryStr += ` AND readStatus = 0`;
    }

    if (options?.archived !== undefined) {
      queryStr += ` AND archived = ?`;
      params.push(options.archived ? 1 : 0);
    } else {
      // By default, exclude archived notifications
      queryStr += ` AND archived = 0`;
    }

    if (options?.category) {
      queryStr += ` AND category = ?`;
      params.push(options.category);
    }

    if (options?.query) {
      queryStr += ` AND (title LIKE ? OR message LIKE ?)`;
      const searchWildcard = `%${options.query}%`;
      params.push(searchWildcard, searchWildcard);
    }

    // Newest first
    queryStr += ` ORDER BY timestamp DESC`;

    const rows = await db.getAllAsync<any>(queryStr, params);

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      message: r.message,
      profileId: r.profileId,
      profileName: r.profileName,
      relationship: r.relationship,
      profilePhoto: r.profilePhoto,
      category: r.category,
      priority: r.priority,
      timestamp: r.timestamp,
      deepLink: r.deepLink,
      actionButtons: r.actionButtons,
      readStatus: r.readStatus,
      archived: r.archived,
    }));
  } catch (err) {
    error("❌ [notificationDB] getNotificationsDB error:", err);
    return [];
  }
};

/**
 * Mark a single notification as read or unread
 */
export const markNotificationReadDB = async (
  id: string,
  read: boolean
): Promise<void> => {
  try {
    await db.runAsync(
      `UPDATE notifications SET readStatus = ? WHERE id = ?`,
      [read ? 1 : 0, id]
    );
    log(`[notificationDB] Marked notification ${id} as read=${read}`);
  } catch (err) {
    error("❌ [notificationDB] markNotificationReadDB error:", err);
    throw err;
  }
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsReadDB = async (): Promise<void> => {
  try {
    await db.runAsync(`UPDATE notifications SET readStatus = 1 WHERE readStatus = 0`);
    log("[notificationDB] Marked all active notifications as read");
  } catch (err) {
    error("❌ [notificationDB] markAllNotificationsReadDB error:", err);
    throw err;
  }
};

/**
 * Mark notifications read by category
 */
export const markNotificationsReadByCategoryDB = async (category: string): Promise<void> => {
  try {
    await db.runAsync(
      `UPDATE notifications SET readStatus = 1 WHERE category = ? AND readStatus = 0`,
      [category]
    );
    log(`[notificationDB] Marked all active notifications in category ${category} as read`);
  } catch (err) {
    error("❌ [notificationDB] markNotificationsReadByCategoryDB error:", err);
    throw err;
  }
};

/**
 * Mark notifications read by deep link
 */
export const markNotificationsReadByDeepLinkDB = async (deepLink: string): Promise<void> => {
  try {
    await db.runAsync(
      `UPDATE notifications SET readStatus = 1 WHERE deepLink = ? AND readStatus = 0`,
      [deepLink]
    );
    log(`[notificationDB] Marked all active notifications with deepLink ${deepLink} as read`);
  } catch (err) {
    error("❌ [notificationDB] markNotificationsReadByDeepLinkDB error:", err);
    throw err;
  }
};

/**
 * Archive or unarchive a notification
 */
export const archiveNotificationDB = async (
  id: string,
  archived: boolean
): Promise<void> => {
  try {
    await db.runAsync(
      `UPDATE notifications SET archived = ? WHERE id = ?`,
      [archived ? 1 : 0, id]
    );
    log(`[notificationDB] Archived notification ${id} archived=${archived}`);
  } catch (err) {
    error("❌ [notificationDB] archiveNotificationDB error:", err);
    throw err;
  }
};

/**
 * Delete a notification permanently from database
 */
export const deleteNotificationDB = async (id: string): Promise<void> => {
  try {
    await db.runAsync(`DELETE FROM notifications WHERE id = ?`, [id]);
    log(`[notificationDB] Deleted notification: ${id}`);
  } catch (err) {
    error("❌ [notificationDB] deleteNotificationDB error:", err);
    throw err;
  }
};

/**
 * Fetch preferences for a given profile, creating default if not exist
 */
export const getNotificationPrefsDB = async (
  profileId: string
): Promise<NotificationPrefs> => {
  try {
    const row = await db.getFirstAsync<any>(
      `SELECT * FROM notification_preferences WHERE profileId = ?`,
      [profileId]
    );
    if (row) {
      return {
        profileId: row.profileId,
        medsEnabled: row.medsEnabled,
        alertsEnabled: row.alertsEnabled,
        stepsEnabled: row.stepsEnabled,
        hydrationEnabled: row.hydrationEnabled,
        reportsEnabled: row.reportsEnabled,
        twinReminderEnabled: row.twinReminderEnabled,
        muted: row.muted,
      };
    }

    // Default settings if not exists
    const defaults = DEFAULT_PREFS(profileId);
    await updateNotificationPrefsDB(defaults);
    return defaults;
  } catch (err) {
    error("❌ [notificationDB] getNotificationPrefsDB error:", err);
    return DEFAULT_PREFS(profileId);
  }
};

/**
 * Update notification preferences for a profile
 */
export const updateNotificationPrefsDB = async (
  prefs: NotificationPrefs
): Promise<void> => {
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO notification_preferences (
        profileId, medsEnabled, alertsEnabled, stepsEnabled,
        hydrationEnabled, reportsEnabled, twinReminderEnabled, muted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prefs.profileId,
        prefs.medsEnabled,
        prefs.alertsEnabled,
        prefs.stepsEnabled,
        prefs.hydrationEnabled,
        prefs.reportsEnabled,
        prefs.twinReminderEnabled,
        prefs.muted,
      ]
    );
    log(`[notificationDB] Updated notification preferences for profile: ${prefs.profileId}`);
  } catch (err) {
    error("❌ [notificationDB] updateNotificationPrefsDB error:", err);
    throw err;
  }
};
