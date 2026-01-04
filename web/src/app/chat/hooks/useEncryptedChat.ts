/**
 * Hook for managing encrypted chat mode
 *
 * Provides state and methods for encrypted chat including:
 * - Mode toggling
 * - Password/unlock management
 * - Direct LLM communication
 * - Session encryption/decryption
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Message } from "@/app/chat/interfaces";
import { getKeyManager, resetKeyManager } from "@/lib/crypto/keyManager";
import { getFullLLMConfigWithKeyManager, getStoredLLMConfig } from "@/lib/crypto/apiKeyManager";
import { setupAutoLock, stopAutoLock, DEFAULT_TIMEOUT_MINUTES } from "@/lib/crypto/sessionTimeout";
import { EncryptedLLMConfig } from "@/lib/crypto/types";
import { sendMessageEncrypted, buildLLMConfig } from "@/lib/llm/streamHandler";
import { LLMClientConfig } from "@/lib/llm/clientLLM";
import { PacketType } from "@/app/chat/services/lib";

/** Storage key for encrypted mode preference */
const ENCRYPTED_MODE_KEY = "onyx_encrypted_mode_enabled";

export interface EncryptedChatState {
  /** Whether encrypted mode is enabled */
  isEnabled: boolean;
  /** Whether the key manager is currently unlocked */
  isUnlocked: boolean;
  /** Whether encrypted mode is ready (has API key configured) */
  isReady: boolean;
  /** Current error message */
  error: string | null;
  /** Whether an operation is in progress */
  isLoading: boolean;
}

export interface UseEncryptedChatReturn {
  /** Current state */
  state: EncryptedChatState;
  /** Enable encrypted mode */
  enableEncryptedMode: () => void;
  /** Disable encrypted mode */
  disableEncryptedMode: () => void;
  /** Unlock with password */
  unlock: (password: string) => Promise<boolean>;
  /** Lock the session */
  lock: () => void;
  /** Check if API key is configured */
  checkAPIKeyConfigured: () => Promise<boolean>;
  /** Get the LLM config (with decrypted API key) */
  getLLMConfig: () => Promise<LLMClientConfig | null>;
  /** Send a message in encrypted mode */
  sendMessage: (
    message: string,
    history: Message[],
    signal?: AbortSignal
  ) => AsyncGenerator<PacketType, void, unknown>;
  /** Clear any error */
  clearError: () => void;
}

/**
 * Hook for managing encrypted chat functionality
 */
export function useEncryptedChat(): UseEncryptedChatReturn {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const keyManager = getKeyManager();
  const llmConfigCacheRef = useRef<LLMClientConfig | null>(null);

  // Check initial state on mount
  useEffect(() => {
    // Check if encrypted mode was previously enabled
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(ENCRYPTED_MODE_KEY);
      if (stored === "true") {
        setIsEnabled(true);
      }
    }

    // Check if key manager is already unlocked
    setIsUnlocked(keyManager.isUnlocked());

    // Check if LLM config exists
    const config = getStoredLLMConfig();
    setIsReady(config !== null);
  }, [keyManager]);

  // Set up auto-lock when unlocked
  useEffect(() => {
    if (isUnlocked && isEnabled) {
      setupAutoLock(
        () => {
          setIsUnlocked(false);
          llmConfigCacheRef.current = null;
        },
        (secondsRemaining) => {
          console.log(`Session will lock in ${secondsRemaining} seconds`);
        }
      );
    } else {
      stopAutoLock();
    }

    return () => {
      stopAutoLock();
    };
  }, [isUnlocked, isEnabled]);

  /**
   * Enable encrypted mode
   */
  const enableEncryptedMode = useCallback(() => {
    setIsEnabled(true);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ENCRYPTED_MODE_KEY, "true");
    }
  }, []);

  /**
   * Disable encrypted mode
   */
  const disableEncryptedMode = useCallback(() => {
    setIsEnabled(false);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(ENCRYPTED_MODE_KEY);
    }
    // Lock and clear state
    keyManager.lock();
    setIsUnlocked(false);
    llmConfigCacheRef.current = null;
    stopAutoLock();
  }, [keyManager]);

  /**
   * Unlock encrypted mode with password
   */
  const unlock = useCallback(
    async (password: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);

      try {
        // Check if there's a stored salt (existing user)
        const storedSalt = keyManager.getStoredSalt();

        if (storedSalt) {
          // Existing user - unlock with stored salt
          await keyManager.unlock(password, storedSalt);
        } else {
          // New user - create new session with new salt
          await keyManager.createNewSession(password);
        }

        setIsUnlocked(true);

        // Pre-fetch LLM config
        try {
          const config = await getFullLLMConfigWithKeyManager();
          if (config) {
            llmConfigCacheRef.current = buildLLMConfig(
              config.provider,
              config.modelName,
              config.apiKey,
              {
                apiBase: config.apiBase,
                temperature: config.temperature,
                maxTokens: config.maxTokens,
              }
            );
            setIsReady(true);
          }
        } catch (configError) {
          // Config fetch failed but unlock succeeded
          console.warn("Failed to fetch LLM config:", configError);
        }

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to unlock";
        setError(message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [keyManager]
  );

  /**
   * Lock the session
   */
  const lock = useCallback(() => {
    keyManager.lock();
    setIsUnlocked(false);
    llmConfigCacheRef.current = null;
    stopAutoLock();
  }, [keyManager]);

  /**
   * Check if API key is configured
   */
  const checkAPIKeyConfigured = useCallback(async (): Promise<boolean> => {
    const config = getStoredLLMConfig();
    const hasConfig = config !== null;
    setIsReady(hasConfig);
    return hasConfig;
  }, []);

  /**
   * Get the LLM configuration with decrypted API key
   */
  const getLLMConfig = useCallback(async (): Promise<LLMClientConfig | null> => {
    if (llmConfigCacheRef.current) {
      return llmConfigCacheRef.current;
    }

    if (!keyManager.isUnlocked()) {
      setError("Session is locked. Please unlock first.");
      return null;
    }

    try {
      const config = await getFullLLMConfigWithKeyManager();
      if (!config) {
        return null;
      }

      const llmConfig = buildLLMConfig(
        config.provider,
        config.modelName,
        config.apiKey,
        {
          apiBase: config.apiBase,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        }
      );

      llmConfigCacheRef.current = llmConfig;
      return llmConfig;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get LLM config";
      setError(message);
      return null;
    }
  }, [keyManager]);

  /**
   * Send a message in encrypted mode (directly to LLM)
   */
  const sendMessage = useCallback(
    async function* (
      message: string,
      history: Message[],
      signal?: AbortSignal
    ): AsyncGenerator<PacketType, void, unknown> {
      if (!keyManager.isUnlocked()) {
        throw new Error("Session is locked. Please unlock first.");
      }

      const llmConfig = await getLLMConfig();
      if (!llmConfig) {
        throw new Error("LLM not configured. Please set up your API key.");
      }

      yield* sendMessageEncrypted({
        message,
        chatHistory: history,
        llmConfig,
        signal,
      });
    },
    [keyManager, getLLMConfig]
  );

  /**
   * Clear any error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    state: {
      isEnabled,
      isUnlocked,
      isReady,
      error,
      isLoading,
    },
    enableEncryptedMode,
    disableEncryptedMode,
    unlock,
    lock,
    checkAPIKeyConfigured,
    getLLMConfig,
    sendMessage,
    clearError,
  };
}

/**
 * Context provider for encrypted chat (to be used in the app)
 */
export function createEncryptedChatContext() {
  // This could be expanded to create a React context for app-wide access
  return useEncryptedChat();
}
