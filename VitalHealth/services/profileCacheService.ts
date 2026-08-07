// VitalHealth/services/profileCacheService.ts
// Namespaced multi-tenant caching service ensuring zero data cross-contamination between profiles

import AsyncStorage from "@react-native-async-storage/async-storage";
import { log, error } from "../utils/logger";

const CACHE_PREFIX = "vitalhealth_profile_cache_v1";

export class ProfileCacheService {
  private static formatKey(profileId: string, domain: string): string {
    const cleanId = profileId || "self";
    return `${CACHE_PREFIX}_${cleanId}_${domain}`;
  }

  /**
   * Retrieves domain data cached for a specific profile ID.
   */
  static async getCache<T>(profileId: string, domain: string): Promise<T | null> {
    try {
      const key = this.formatKey(profileId, domain);
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (e) {
      error(`[ProfileCacheService] Failed reading cache for [${domain}] (Profile: ${profileId}):`, e);
      return null;
    }
  }

  /**
   * Caches domain data bound to a specific profile ID.
   */
  static async setCache<T>(profileId: string, domain: string, data: T): Promise<void> {
    try {
      const key = this.formatKey(profileId, domain);
      await AsyncStorage.setItem(key, JSON.stringify({
        updatedAt: Date.now(),
        data,
      }));
      log(`[ProfileCacheService] Cached [${domain}] data for profile [${profileId}]`);
    } catch (e) {
      error(`[ProfileCacheService] Failed writing cache for [${domain}] (Profile: ${profileId}):`, e);
    }
  }

  /**
   * Clears cached data for a specific profile domain or all domains for a profile.
   */
  static async clearCache(profileId: string, domain?: string): Promise<void> {
    try {
      if (domain) {
        const key = this.formatKey(profileId, domain);
        await AsyncStorage.removeItem(key);
      } else {
        const allKeys = await AsyncStorage.getAllKeys();
        const profileKeys = allKeys.filter((k) => k.startsWith(`${CACHE_PREFIX}_${profileId || "self"}_`));
        if (profileKeys.length > 0) {
          await AsyncStorage.multiRemove(profileKeys);
        }
      }
    } catch (e) {
      error(`[ProfileCacheService] Failed clearing cache for profile [${profileId}]:`, e);
    }
  }
}
