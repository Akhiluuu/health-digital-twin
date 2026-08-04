// services/pie/DeliveryEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Delivers approved notifications to the local device UI using Notifee.
// Translates PIE categories & priority levels to Android channels/importance levels.
// Sets correct action buttons, deep link details, and payloads.
// ─────────────────────────────────────────────────────────────────────────────

import { log, error as logError } from '../../utils/logger';
import type { PIECandidate } from './types';

// Safe require for Notifee module
import { NativeModules } from 'react-native';

let notifee: any = null;
let AndroidImportance: any = { HIGH: 4, DEFAULT: 3, LOW: 2 };
let AndroidVisibility: any = { PRIVATE: 0, PUBLIC: 1 };

if (Boolean(NativeModules?.NotifeeApiModule)) {
  try {
    const notifeeModule = require('@notifee/react-native');
    notifee = notifeeModule.default;
    AndroidImportance = notifeeModule.AndroidImportance;
    AndroidVisibility = notifeeModule.AndroidVisibility;
  } catch (err) {
    log('⚠️ DeliveryEngine: Notifee not available in this environment');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Map PIE priority to Android Importance
// ─────────────────────────────────────────────────────────────────────────────

function getAndroidImportance(priority: string): number {
  switch (priority) {
    case 'emergency':
    case 'critical':
      return AndroidImportance.HIGH;
    case 'high':
    case 'medium':
      return AndroidImportance.DEFAULT;
    case 'low':
    case 'silent':
    default:
      return AndroidImportance.LOW;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deliver a single approved candidate
// ─────────────────────────────────────────────────────────────────────────────

export async function deliverNotification(candidate: PIECandidate): Promise<boolean> {
  if (!notifee) {
    log('⚠️ Notifee unavailable, skipping notification delivery:', candidate.title);
    return false;
  }

  try {
    const channelId = `pie_${candidate.category}`;
    const channelName = candidate.category
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    // Create channel dynamically if not exists
    await notifee.createChannel({
      id: channelId,
      name: channelName,
      importance: getAndroidImportance(candidate.priority),
      vibration: candidate.priority !== 'silent' && candidate.priority !== 'low',
    });

    const actions = candidate.actionButtons.map(act => ({
      title: act.label,
      pressAction: { id: act.id, launchActivity: 'default' },
    }));

    const displayOptions: any = {
      id: candidate.id,
      title: candidate.title,
      body: candidate.body,
      data: {
        type: candidate.category,
        deepLink: candidate.deepLink || undefined,
        sourceEngineId: candidate.sourceEngineId,
        triggerRuleId: candidate.triggerRuleId,
        profileId: candidate.profileId,
      },
      android: {
        channelId,
        importance: getAndroidImportance(candidate.priority),
        pressAction: { id: 'default' },
        actions: actions.length > 0 ? actions : undefined,
        visibility: candidate.priority === 'emergency' ? AndroidVisibility.PUBLIC : AndroidVisibility.PRIVATE,
      },
    };

    await notifee.displayNotification(displayOptions);
    log(`[PIE DeliveryEngine] Notification delivered successfully: ${candidate.title}`);
    return true;
  } catch (err) {
    logError('[PIE DeliveryEngine] deliverNotification error:', err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deliver multiple approved candidates
// ─────────────────────────────────────────────────────────────────────────────

export async function deliverAll(candidates: PIECandidate[]): Promise<void> {
  for (const cand of candidates) {
    await deliverNotification(cand);
  }
}
