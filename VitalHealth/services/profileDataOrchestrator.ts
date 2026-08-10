// VitalHealth/services/profileDataOrchestrator.ts
// Unified Hydration Barrier: Synchronizes async domain loading during profile switches

import { log, warn } from "../utils/logger";

import { nanoid } from "../utils/nanoid";

type LoadingCallback = (isLoading: boolean) => void;

class ProfileDataOrchestrator {
  private activeSwitchToken: string | null = null;
  private registeredDomains: Map<string, boolean> = new Map();
  private listeners: Set<LoadingCallback> = new Set();
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Initiates a profile switch transaction.
   * Resets all domain readiness statuses.
   */
  startSwitchTransaction(targetProfileId: string): string {
    const token = `${targetProfileId}_${Date.now()}_${nanoid(8)}`;
    this.activeSwitchToken = token;
    
    // Set all currently registered domains to loading state
    this.registeredDomains.forEach((_, domain) => {
      this.registeredDomains.set(domain, true);
    });

    log(`[ProfileDataOrchestrator] 🚀 Started switch transaction to [${targetProfileId}] (Token: ${token})`);
    this.notifyListeners(true);

    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    this.safetyTimer = setTimeout(() => {
      if (this.activeSwitchToken === token) {
        warn(`[ProfileDataOrchestrator] ⚠️ Safety timeout (2000ms) reached for token ${token}. Releasing loading barrier.`);
        this.forceRelease();
      }
    }, 2000);

    return token;
  }

  /**
   * Called by domain contexts to report hydration status.
   */
  reportDomainStatus(domain: string, isLoading: boolean, token?: string) {
    if (token && token !== this.activeSwitchToken) {
      log(`[ProfileDataOrchestrator] Ignored stale status update for domain [${domain}] (token mismatch)`);
      return;
    }

    this.registeredDomains.set(domain, isLoading);
    log(`[ProfileDataOrchestrator] Domain [${domain}] reported loading: ${isLoading}`);

    this.checkCompletion();
  }

  /**
   * Register a listener for overall orchestrator loading status.
   */
  subscribe(callback: LoadingCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private checkCompletion() {
    if (!this.activeSwitchToken) return;

    const isAnyDomainLoading = Array.from(this.registeredDomains.values()).some((loading) => loading === true);

    if (!isAnyDomainLoading) {
      log(`[ProfileDataOrchestrator] ✅ All registered domain contexts hydrated successfully for transaction ${this.activeSwitchToken}`);
      if (this.safetyTimer) clearTimeout(this.safetyTimer);
      this.activeSwitchToken = null;
      this.notifyListeners(false);
    }
  }

  forceRelease() {
    this.registeredDomains.forEach((_, domain) => this.registeredDomains.set(domain, false));
    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    this.activeSwitchToken = null;
    this.notifyListeners(false);
  }

  private notifyListeners(isLoading: boolean) {
    this.listeners.forEach((cb) => {
      try {
        cb(isLoading);
      } catch (err) {
        warn(`[ProfileDataOrchestrator] Error notifying listener:`, err);
      }
    });
  }

  getActiveToken(): string | null {
    return this.activeSwitchToken;
  }
}

export const profileDataOrchestrator = new ProfileDataOrchestrator();
