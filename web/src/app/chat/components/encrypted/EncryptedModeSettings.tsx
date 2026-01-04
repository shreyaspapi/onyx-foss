"use client";

import { useState, useCallback, useEffect } from "react";
import Modal from "@/refresh-components/Modal";
import Button from "@/refresh-components/buttons/Button";
import { SvgSettings } from "@opal/icons";
import { getKeyManager } from "@/lib/crypto/keyManager";
import {
  getStoredLLMConfig,
  clearLLMConfig,
  hasEncryptedAPIKey,
} from "@/lib/crypto/apiKeyManager";
import { SecretType, EncryptedLLMConfig } from "@/lib/crypto/types";
import {
  getTimeoutManager,
  DEFAULT_TIMEOUT_MINUTES,
  SessionTimeoutManager,
} from "@/lib/crypto/sessionTimeout";

export interface EncryptedModeSettingsProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback to open API key setup */
  onSetupAPIKey: () => void;
  /** Callback to lock the session */
  onLock: () => void;
  /** Callback to disable encrypted mode */
  onDisableEncryptedMode: () => void;
}

export default function EncryptedModeSettings({
  isOpen,
  onClose,
  onSetupAPIKey,
  onLock,
  onDisableEncryptedMode,
}: EncryptedModeSettingsProps) {
  const [llmConfig, setLlmConfig] = useState<EncryptedLLMConfig | null>(null);
  const [hasAPIKey, setHasAPIKey] = useState(false);
  const [autoLockTimeout, setAutoLockTimeout] = useState(DEFAULT_TIMEOUT_MINUTES);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      // Load LLM config
      const config = getStoredLLMConfig();
      setLlmConfig(config);

      // Check if API key exists
      if (config) {
        const secretType = getSecretTypeForProvider(config.provider);
        const exists = await hasEncryptedAPIKey(secretType);
        setHasAPIKey(exists);
      }

      // Get current auto-lock timeout
      const timeoutManager = getTimeoutManager();
      if (timeoutManager) {
        setAutoLockTimeout(timeoutManager.getTimeout());
      } else {
        setAutoLockTimeout(SessionTimeoutManager.loadSavedTimeout());
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimeoutChange = useCallback(
    (newTimeout: number) => {
      setAutoLockTimeout(newTimeout);
      const timeoutManager = getTimeoutManager();
      if (timeoutManager) {
        timeoutManager.updateTimeout(newTimeout);
      }
    },
    []
  );

  const handleClearAPIKey = useCallback(async () => {
    if (confirm("Are you sure you want to clear your API key? You will need to set it up again.")) {
      clearLLMConfig();
      setLlmConfig(null);
      setHasAPIKey(false);
    }
  }, []);

  const handleDisableMode = useCallback(() => {
    if (
      confirm(
        "Are you sure you want to disable encrypted mode? Your encrypted sessions will remain stored but you will need to enable encrypted mode again to access them."
      )
    ) {
      onDisableEncryptedMode();
    }
  }, [onDisableEncryptedMode]);

  const keyManager = getKeyManager();
  const isUnlocked = keyManager.isUnlocked();

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <Modal.Header
          icon={SvgSettings}
          title="Encrypted Mode Settings"
          onClose={onClose}
        />

        <Modal.Body className="flex flex-col gap-6 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-text-muted">Loading...</span>
            </div>
          ) : (
            <>
              {/* Status Section */}
              <section>
                <h3 className="text-sm font-semibold mb-2">Status</h3>
                <div className="flex items-center gap-2 p-3 bg-background-tint-01 rounded-md">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isUnlocked ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm">
                    {isUnlocked ? "Unlocked" : "Locked"}
                  </span>
                  {isUnlocked && (
                    <Button
                      onClick={onLock}
                      secondary
                      className="ml-auto text-xs"
                    >
                      Lock Now
                    </Button>
                  )}
                </div>
              </section>

              {/* LLM Configuration Section */}
              <section>
                <h3 className="text-sm font-semibold mb-2">LLM Configuration</h3>
                {llmConfig ? (
                  <div className="p-3 bg-background-tint-01 rounded-md space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">Provider:</span>
                      <span className="capitalize">{llmConfig.provider}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">Model:</span>
                      <span>{llmConfig.modelName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">API Key:</span>
                      <span>
                        {hasAPIKey ? "✓ Configured" : "✗ Not configured"}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button onClick={onSetupAPIKey} secondary className="text-xs">
                        Update API Key
                      </Button>
                      <Button
                        onClick={handleClearAPIKey}
                        secondary
                        className="text-xs text-red-500"
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-background-tint-01 rounded-md">
                    <p className="text-sm text-text-muted mb-3">
                      No LLM configured. Set up an API key to use encrypted chat.
                    </p>
                    <Button onClick={onSetupAPIKey} className="text-xs">
                      Set Up API Key
                    </Button>
                  </div>
                )}
              </section>

              {/* Auto-Lock Section */}
              <section>
                <h3 className="text-sm font-semibold mb-2">Auto-Lock</h3>
                <div className="p-3 bg-background-tint-01 rounded-md">
                  <label className="flex items-center justify-between">
                    <span className="text-sm">Lock after inactivity:</span>
                    <select
                      value={autoLockTimeout}
                      onChange={(e) =>
                        handleTimeoutChange(parseInt(e.target.value, 10))
                      }
                      className="px-2 py-1 text-sm border rounded bg-background"
                    >
                      <option value={5}>5 minutes</option>
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={0}>Never</option>
                    </select>
                  </label>
                </div>
              </section>

              {/* Security Info */}
              <section>
                <h3 className="text-sm font-semibold mb-2">About Encrypted Mode</h3>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700 space-y-2">
                  <p>
                    • Your messages are encrypted in your browser before being
                    stored.
                  </p>
                  <p>
                    • LLM API calls go directly from your browser to the
                    provider.
                  </p>
                  <p>• The server cannot read your encrypted data.</p>
                  <p>
                    • If you forget your password, your data cannot be
                    recovered.
                  </p>
                </div>
              </section>

              {/* Danger Zone */}
              <section>
                <h3 className="text-sm font-semibold mb-2 text-red-600">
                  Danger Zone
                </h3>
                <div className="p-3 border border-red-200 rounded-md">
                  <Button
                    onClick={handleDisableMode}
                    secondary
                    className="text-xs text-red-500"
                  >
                    Disable Encrypted Mode
                  </Button>
                </div>
              </section>
            </>
          )}
        </Modal.Body>

        <Modal.Footer className="flex flex-row p-4 items-center justify-end w-full">
          <Button onClick={onClose}>Close</Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal>
  );
}

function getSecretTypeForProvider(
  provider: EncryptedLLMConfig["provider"]
): SecretType {
  switch (provider) {
    case "openai":
      return SecretType.OPENAI_API_KEY;
    case "anthropic":
      return SecretType.ANTHROPIC_API_KEY;
    case "azure":
      return SecretType.AZURE_API_KEY;
    case "google":
      return SecretType.GOOGLE_API_KEY;
    case "ollama":
      return SecretType.LLM_API_KEY;
    default:
      return SecretType.LLM_API_KEY;
  }
}
