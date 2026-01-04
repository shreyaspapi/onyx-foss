/**
 * Auto-lock functionality for encrypted chat mode
 *
 * Provides session timeout management to automatically lock
 * encrypted sessions after a period of inactivity.
 */

import { getKeyManager } from "./keyManager";

/** Default timeout in minutes */
export const DEFAULT_TIMEOUT_MINUTES = 15;

/** Events that indicate user activity */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

/** Storage key for timeout preference */
const TIMEOUT_STORAGE_KEY = "onyx_encrypted_mode_timeout";

/**
 * Configuration for session timeout
 */
export interface SessionTimeoutConfig {
  /** Timeout in minutes before auto-lock */
  timeoutMinutes: number;
  /** Callback when session is locked */
  onLock: () => void;
  /** Optional callback before lock (for warning) */
  onWarning?: (secondsRemaining: number) => void;
  /** Seconds before lock to trigger warning */
  warningSeconds?: number;
}

/**
 * Session timeout manager
 *
 * Monitors user activity and automatically locks the encrypted
 * session after a period of inactivity.
 */
export class SessionTimeoutManager {
  private config: SessionTimeoutConfig;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private warningTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isActive: boolean = false;
  private boundResetTimer: () => void;

  constructor(config: SessionTimeoutConfig) {
    this.config = {
      warningSeconds: 60, // Default 1 minute warning
      ...config,
    };
    this.boundResetTimer = this.resetTimer.bind(this);
  }

  /**
   * Start monitoring for inactivity
   */
  start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.startTimer();
    this.attachActivityListeners();
  }

  /**
   * Stop monitoring (e.g., when user logs out or explicitly locks)
   */
  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.clearTimers();
    this.detachActivityListeners();
  }

  /**
   * Update the timeout duration
   *
   * @param timeoutMinutes - New timeout in minutes
   */
  updateTimeout(timeoutMinutes: number): void {
    this.config.timeoutMinutes = timeoutMinutes;

    // Persist preference
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(TIMEOUT_STORAGE_KEY, String(timeoutMinutes));
    }

    // Restart timer with new duration if active
    if (this.isActive) {
      this.resetTimer();
    }
  }

  /**
   * Get the current timeout setting
   */
  getTimeout(): number {
    return this.config.timeoutMinutes;
  }

  /**
   * Load saved timeout preference
   */
  static loadSavedTimeout(): number {
    if (typeof localStorage === "undefined") {
      return DEFAULT_TIMEOUT_MINUTES;
    }

    const saved = localStorage.getItem(TIMEOUT_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return DEFAULT_TIMEOUT_MINUTES;
  }

  private startTimer(): void {
    this.clearTimers();

    const timeoutMs = this.config.timeoutMinutes * 60 * 1000;

    // Set up warning timer if configured
    if (this.config.onWarning && this.config.warningSeconds) {
      const warningMs = timeoutMs - this.config.warningSeconds * 1000;
      if (warningMs > 0) {
        this.warningTimeoutId = setTimeout(() => {
          this.config.onWarning?.(this.config.warningSeconds!);
        }, warningMs);
      }
    }

    // Set up lock timer
    this.timeoutId = setTimeout(() => {
      this.lock();
    }, timeoutMs);
  }

  private resetTimer(): void {
    if (!this.isActive) return;
    this.startTimer();
  }

  private clearTimers(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.warningTimeoutId) {
      clearTimeout(this.warningTimeoutId);
      this.warningTimeoutId = null;
    }
  }

  private attachActivityListeners(): void {
    if (typeof window === "undefined") return;

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, this.boundResetTimer, { passive: true });
    }
  }

  private detachActivityListeners(): void {
    if (typeof window === "undefined") return;

    for (const event of ACTIVITY_EVENTS) {
      window.removeEventListener(event, this.boundResetTimer);
    }
  }

  private lock(): void {
    this.stop();

    // Lock the key manager
    const keyManager = getKeyManager();
    keyManager.lock();

    // Notify via callback
    this.config.onLock();
  }
}

// Singleton instance
let timeoutManagerInstance: SessionTimeoutManager | null = null;

/**
 * Set up auto-lock for encrypted mode
 *
 * @param onLock - Callback when session is locked
 * @param onWarning - Optional callback before lock
 * @param timeoutMinutes - Timeout in minutes (uses saved preference if not specified)
 * @returns The session timeout manager
 */
export function setupAutoLock(
  onLock: () => void,
  onWarning?: (secondsRemaining: number) => void,
  timeoutMinutes?: number
): SessionTimeoutManager {
  // Clean up existing instance
  if (timeoutManagerInstance) {
    timeoutManagerInstance.stop();
  }

  const timeout = timeoutMinutes ?? SessionTimeoutManager.loadSavedTimeout();

  timeoutManagerInstance = new SessionTimeoutManager({
    timeoutMinutes: timeout,
    onLock,
    onWarning,
  });

  timeoutManagerInstance.start();
  return timeoutManagerInstance;
}

/**
 * Stop auto-lock monitoring
 */
export function stopAutoLock(): void {
  if (timeoutManagerInstance) {
    timeoutManagerInstance.stop();
    timeoutManagerInstance = null;
  }
}

/**
 * Get the current timeout manager instance
 */
export function getTimeoutManager(): SessionTimeoutManager | null {
  return timeoutManagerInstance;
}
