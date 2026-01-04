/**
 * Session key management for encrypted chat mode
 *
 * Manages the derived encryption key in memory with optional
 * session storage persistence for tab survival.
 */

import {
  deriveKey,
  base64ToArrayBuffer,
  arrayBufferToBase64,
  generateSalt,
} from "./encryptedChat";
import { EncryptedBlob, EncryptionError, EncryptionErrorType } from "./types";

/** Storage key for session persistence */
const SESSION_STORAGE_KEY = "onyx_encrypted_mode_salt";

/**
 * Manages the encryption key for encrypted chat mode
 *
 * The key is derived from the user's password and stored in memory.
 * Optionally, the salt can be persisted to sessionStorage so that
 * the key can be re-derived after page refresh (user must re-enter password).
 */
export class EncryptedModeKeyManager {
  private derivedKey: CryptoKey | null = null;
  private currentSalt: Uint8Array | null = null;
  private lockTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /**
   * Unlock encrypted mode by deriving a key from the password
   *
   * @param password - User's encryption password
   * @param salt - Salt for key derivation (use existing or generate new)
   */
  async unlock(password: string, salt?: Uint8Array): Promise<void> {
    const useSalt = salt ?? generateSalt();
    this.derivedKey = await deriveKey(password, useSalt);
    this.currentSalt = useSalt;

    // Store salt in sessionStorage for potential re-derivation
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        arrayBufferToBase64(useSalt.buffer as ArrayBuffer)
      );
    }
  }

  /**
   * Unlock using an existing encrypted blob's salt
   * This is used when loading an existing session
   *
   * @param password - User's encryption password
   * @param blob - Encrypted blob containing the salt
   */
  async unlockWithBlob(password: string, blob: EncryptedBlob): Promise<void> {
    const salt = base64ToArrayBuffer(blob.salt);
    await this.unlock(password, salt);
  }

  /**
   * Check if the key manager is currently unlocked
   */
  isUnlocked(): boolean {
    return this.derivedKey !== null;
  }

  /**
   * Get the current derived key
   * @throws If not unlocked
   */
  getKey(): CryptoKey {
    if (!this.derivedKey) {
      throw new EncryptionError(
        EncryptionErrorType.KEY_DERIVATION_FAILED,
        "Key manager is locked. Call unlock() first."
      );
    }
    return this.derivedKey;
  }

  /**
   * Get the current salt (if unlocked)
   */
  getSalt(): Uint8Array | null {
    return this.currentSalt;
  }

  /**
   * Get salt as base64 string
   */
  getSaltBase64(): string | null {
    if (!this.currentSalt) return null;
    return arrayBufferToBase64(this.currentSalt.buffer as ArrayBuffer);
  }

  /**
   * Lock the key manager, clearing the key from memory
   */
  lock(): void {
    this.derivedKey = null;
    this.currentSalt = null;

    // Clear any pending auto-lock timeout
    if (this.lockTimeoutId) {
      clearTimeout(this.lockTimeoutId);
      this.lockTimeoutId = null;
    }

    // Clear session storage
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  /**
   * Get the stored salt from sessionStorage (if any)
   * This can be used to prompt user for password re-entry after refresh
   */
  getStoredSalt(): Uint8Array | null {
    if (typeof sessionStorage === "undefined") return null;

    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;

    try {
      return base64ToArrayBuffer(stored);
    } catch {
      return null;
    }
  }

  /**
   * Check if there's a stored salt (indicating previous session)
   */
  hasStoredSalt(): boolean {
    return this.getStoredSalt() !== null;
  }

  /**
   * Set up auto-lock after a period of inactivity
   *
   * @param timeoutMinutes - Minutes of inactivity before auto-lock
   * @param onLock - Callback when auto-lock triggers
   */
  setupAutoLock(timeoutMinutes: number, onLock?: () => void): void {
    // Clear any existing timeout
    if (this.lockTimeoutId) {
      clearTimeout(this.lockTimeoutId);
    }

    if (!this.isUnlocked()) return;

    this.lockTimeoutId = setTimeout(
      () => {
        this.lock();
        onLock?.();
      },
      timeoutMinutes * 60 * 1000
    );
  }

  /**
   * Reset the auto-lock timer (call on user activity)
   *
   * @param timeoutMinutes - Minutes of inactivity before auto-lock
   * @param onLock - Callback when auto-lock triggers
   */
  resetAutoLock(timeoutMinutes: number, onLock?: () => void): void {
    if (this.isUnlocked()) {
      this.setupAutoLock(timeoutMinutes, onLock);
    }
  }

  /**
   * Change the encryption password
   * This re-derives the key with the new password but keeps the same salt
   *
   * @param newPassword - New encryption password
   */
  async changePassword(newPassword: string): Promise<void> {
    if (!this.currentSalt) {
      throw new EncryptionError(
        EncryptionErrorType.KEY_DERIVATION_FAILED,
        "Cannot change password: no salt available. Unlock first."
      );
    }

    // Derive new key with existing salt
    // Note: In a real password change, you'd typically want a new salt
    // and re-encrypt all data. This is a simplified version.
    this.derivedKey = await deriveKey(newPassword, this.currentSalt);
  }

  /**
   * Generate a new salt and derive a key (for new sessions)
   *
   * @param password - User's encryption password
   * @returns The generated salt (store this with encrypted data)
   */
  async createNewSession(password: string): Promise<Uint8Array> {
    const salt = generateSalt();
    await this.unlock(password, salt);
    return salt;
  }
}

// Singleton instance for app-wide use
let keyManagerInstance: EncryptedModeKeyManager | null = null;

/**
 * Get the singleton key manager instance
 */
export function getKeyManager(): EncryptedModeKeyManager {
  if (!keyManagerInstance) {
    keyManagerInstance = new EncryptedModeKeyManager();
  }
  return keyManagerInstance;
}

/**
 * Reset the key manager instance (for testing or logout)
 */
export function resetKeyManager(): void {
  if (keyManagerInstance) {
    keyManagerInstance.lock();
    keyManagerInstance = null;
  }
}
