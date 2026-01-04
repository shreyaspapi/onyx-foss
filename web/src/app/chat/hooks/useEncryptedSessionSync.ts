/**
 * Hook for syncing encrypted chat sessions with the server
 *
 * Handles auto-save, session loading, and persistence of encrypted chat data.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Message } from "@/app/chat/interfaces";
import { getKeyManager } from "@/lib/crypto/keyManager";
import {
  encryptSessionData,
  decryptSessionData,
  base64ToArrayBuffer,
  arrayBufferToBase64,
} from "@/lib/crypto/encryptedChat";
import {
  DecryptedSessionData,
  SessionMetadata,
  EncryptedBlob,
  EncryptedLLMConfig,
} from "@/lib/crypto/types";

/** API base for encrypted sessions */
const API_BASE = "/api/encrypted-sessions";

/** Debounce time for auto-save (ms) */
const AUTO_SAVE_DEBOUNCE = 1000;

/**
 * Response from the server for an encrypted session
 */
interface EncryptedSessionAPIResponse {
  session_id: string;
  encrypted_data: string;
  encryption_version: number;
  created_at: string;
  updated_at: string;
  encrypted_name?: string;
}

/**
 * Hook for managing encrypted session sync
 */
export function useEncryptedSessionSync(
  sessionId: string | null,
  messages: Message[],
  metadata: SessionMetadata | null,
  llmConfig?: EncryptedLLMConfig
) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedHashRef = useRef<string | null>(null);

  const keyManager = getKeyManager();

  /**
   * Generate a hash of the current session data for change detection
   */
  const generateHash = useCallback(() => {
    return JSON.stringify({
      messages: messages.map((m) => ({
        id: m.messageId,
        content: m.message,
        type: m.type,
      })),
      metadata,
    });
  }, [messages, metadata]);

  /**
   * Save the current session to the server
   */
  const saveSession = useCallback(async (): Promise<boolean> => {
    if (!sessionId || !keyManager.isUnlocked() || !metadata) {
      return false;
    }

    const currentHash = generateHash();
    if (currentHash === lastSavedHashRef.current) {
      return true; // No changes to save
    }

    setIsSaving(true);
    setError(null);

    try {
      const sessionData: DecryptedSessionData = {
        messages,
        metadata,
        llmConfig,
      };

      const key = keyManager.getKey();
      const salt = keyManager.getSalt();

      const encryptedBlob = await encryptSessionData(sessionData, key, salt ?? undefined);

      // Encrypt the session name for display in sidebar
      const nameBlob = await encryptSessionData(
        { name: metadata.name },
        key,
        salt ?? undefined
      );

      // Convert to base64 for API
      const encryptedData = btoa(JSON.stringify(encryptedBlob));
      const encryptedName = btoa(JSON.stringify(nameBlob));

      // Send to server
      const response = await fetch(`${API_BASE}/${sessionId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          encrypted_data: encryptedData,
          encrypted_name: encryptedName,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save session: ${response.status}`);
      }

      lastSavedHashRef.current = currentHash;
      setLastSaved(new Date());
      return true;
    } catch (err) {
      console.error("Failed to save encrypted session:", err);
      setError(err instanceof Error ? err.message : "Failed to save session");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [sessionId, messages, metadata, llmConfig, keyManager, generateHash]);

  /**
   * Load a session from the server
   */
  const loadSession = useCallback(
    async (id: string): Promise<DecryptedSessionData | null> => {
      if (!keyManager.isUnlocked()) {
        throw new Error("Key manager is not unlocked");
      }

      try {
        const response = await fetch(`${API_BASE}/${id}`);

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`Failed to load session: ${response.status}`);
        }

        const data: EncryptedSessionAPIResponse = await response.json();

        // Decode and decrypt
        const encryptedBlob: EncryptedBlob = JSON.parse(atob(data.encrypted_data));
        const key = keyManager.getKey();

        const decrypted = await decryptSessionData<DecryptedSessionData>(
          encryptedBlob,
          key
        );

        // Update the hash so we don't immediately try to save
        lastSavedHashRef.current = JSON.stringify({
          messages: decrypted.messages.map((m) => ({
            id: m.messageId,
            content: m.message,
            type: m.type,
          })),
          metadata: decrypted.metadata,
        });

        return decrypted;
      } catch (err) {
        console.error("Failed to load encrypted session:", err);
        throw err;
      }
    },
    [keyManager]
  );

  /**
   * Create a new encrypted session
   */
  const createSession = useCallback(
    async (initialMetadata: SessionMetadata): Promise<string | null> => {
      if (!keyManager.isUnlocked()) {
        throw new Error("Key manager is not unlocked");
      }

      try {
        const sessionData: DecryptedSessionData = {
          messages: [],
          metadata: initialMetadata,
          llmConfig,
        };

        const key = keyManager.getKey();
        const salt = keyManager.getSalt();

        const encryptedBlob = await encryptSessionData(sessionData, key, salt ?? undefined);
        const nameBlob = await encryptSessionData(
          { name: initialMetadata.name },
          key,
          salt ?? undefined
        );

        const encryptedData = btoa(JSON.stringify(encryptedBlob));
        const encryptedName = btoa(JSON.stringify(nameBlob));

        const response = await fetch(API_BASE, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            encrypted_data: encryptedData,
            encryption_version: encryptedBlob.version,
            encrypted_name: encryptedName,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create session: ${response.status}`);
        }

        const data: EncryptedSessionAPIResponse = await response.json();
        return data.session_id;
      } catch (err) {
        console.error("Failed to create encrypted session:", err);
        throw err;
      }
    },
    [keyManager, llmConfig]
  );

  /**
   * Delete an encrypted session
   */
  const deleteSession = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: "DELETE",
      });

      return response.ok || response.status === 404;
    } catch (err) {
      console.error("Failed to delete encrypted session:", err);
      return false;
    }
  }, []);

  /**
   * List all encrypted sessions
   */
  const listSessions = useCallback(async () => {
    try {
      const response = await fetch(API_BASE);
      if (!response.ok) {
        throw new Error(`Failed to list sessions: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      console.error("Failed to list encrypted sessions:", err);
      throw err;
    }
  }, []);

  // Auto-save effect with debounce
  useEffect(() => {
    if (!sessionId || !keyManager.isUnlocked() || messages.length === 0) {
      return;
    }

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule a new save
    saveTimeoutRef.current = setTimeout(() => {
      saveSession();
    }, AUTO_SAVE_DEBOUNCE);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [sessionId, messages, keyManager, saveSession]);

  // Force save on unmount
  useEffect(() => {
    return () => {
      if (sessionId && keyManager.isUnlocked()) {
        // Can't await in cleanup, but we try anyway
        saveSession();
      }
    };
  }, []);

  return {
    isSaving,
    lastSaved,
    error,
    saveSession,
    loadSession,
    createSession,
    deleteSession,
    listSessions,
  };
}

/**
 * Hook for decrypting session names for sidebar display
 */
export function useDecryptedSessionNames(
  encryptedNames: Map<string, string>
): Map<string, string> {
  const [decryptedNames, setDecryptedNames] = useState<Map<string, string>>(
    new Map()
  );
  const keyManager = getKeyManager();

  useEffect(() => {
    if (!keyManager.isUnlocked()) {
      setDecryptedNames(new Map());
      return;
    }

    const decryptAll = async () => {
      const results = new Map<string, string>();
      const key = keyManager.getKey();

      for (const [id, encryptedName] of encryptedNames) {
        try {
          const blob: EncryptedBlob = JSON.parse(atob(encryptedName));
          const decrypted = await decryptSessionData<{ name: string }>(
            blob,
            key
          );
          results.set(id, decrypted.name);
        } catch {
          results.set(id, "Encrypted Session");
        }
      }

      setDecryptedNames(results);
    };

    decryptAll();
  }, [encryptedNames, keyManager]);

  return decryptedNames;
}
