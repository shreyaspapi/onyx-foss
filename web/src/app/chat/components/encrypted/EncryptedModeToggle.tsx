"use client";

import { useState, useEffect, useCallback } from "react";
import { SvgLock, SvgUnlock, SvgSettings } from "@opal/icons";
import Button from "@/refresh-components/buttons/Button";
import { getKeyManager, ENCRYPTED_MODE_ENABLED_KEY } from "@/lib/crypto/keyManager";
import EncryptionUnlockDialog from "./EncryptionUnlockDialog";
import EncryptedModeSettings from "./EncryptedModeSettings";
import APIKeySetup from "./APIKeySetup";

export interface EncryptedModeToggleProps {
  /** Optional callback when encrypted mode state changes */
  onModeChange?: (enabled: boolean, unlocked: boolean) => void;
}

/**
 * A toggle component that enables/disables encrypted mode
 * and shows lock/unlock status. Add this to your chat interface
 * to let users access encrypted chat functionality.
 */
export default function EncryptedModeToggle({
  onModeChange,
}: EncryptedModeToggleProps) {
  const [encryptedModeEnabled, setEncryptedModeEnabled] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAPIKeySetup, setShowAPIKeySetup] = useState(false);
  const [isNewSetup, setIsNewSetup] = useState(false);

  // Check encrypted mode status on mount
  useEffect(() => {
    const enabled =
      typeof window !== "undefined" &&
      localStorage.getItem(ENCRYPTED_MODE_ENABLED_KEY) === "true";
    setEncryptedModeEnabled(enabled);

    if (enabled) {
      const keyManager = getKeyManager();
      setIsUnlocked(keyManager.isUnlocked());
    }
  }, []);

  // Notify parent of mode changes
  useEffect(() => {
    onModeChange?.(encryptedModeEnabled, isUnlocked);
  }, [encryptedModeEnabled, isUnlocked, onModeChange]);

  const handleEnableEncryptedMode = useCallback(() => {
    setIsNewSetup(true);
    setShowUnlockDialog(true);
  }, []);

  const handleUnlockSuccess = useCallback(() => {
    setShowUnlockDialog(false);
    setIsUnlocked(true);
    setEncryptedModeEnabled(true);
    localStorage.setItem(ENCRYPTED_MODE_ENABLED_KEY, "true");

    // If new setup, show API key setup
    if (isNewSetup) {
      setIsNewSetup(false);
      setShowAPIKeySetup(true);
    }
  }, [isNewSetup]);

  const handleLock = useCallback(() => {
    const keyManager = getKeyManager();
    keyManager.lock();
    setIsUnlocked(false);
    setShowSettings(false);
  }, []);

  const handleUnlock = useCallback(() => {
    setIsNewSetup(false);
    setShowUnlockDialog(true);
  }, []);

  const handleDisableEncryptedMode = useCallback(() => {
    const keyManager = getKeyManager();
    keyManager.lock();
    localStorage.removeItem(ENCRYPTED_MODE_ENABLED_KEY);
    setEncryptedModeEnabled(false);
    setIsUnlocked(false);
    setShowSettings(false);
  }, []);

  const handleAPIKeySetupComplete = useCallback(() => {
    setShowAPIKeySetup(false);
  }, []);

  // Not enabled - show enable button
  if (!encryptedModeEnabled) {
    return (
      <>
        <Button
          onClick={handleEnableEncryptedMode}
          secondary
          className="flex items-center gap-2 text-sm"
          title="Enable end-to-end encryption for your chats"
        >
          <SvgLock className="w-4 h-4" />
          <span className="hidden sm:inline">Enable Encrypted Mode</span>
        </Button>

        <EncryptionUnlockDialog
          isOpen={showUnlockDialog}
          onClose={() => {
            setShowUnlockDialog(false);
            setIsNewSetup(false);
          }}
          onUnlockSuccess={handleUnlockSuccess}
          isNewSetup={isNewSetup}
        />

        <APIKeySetup
          isOpen={showAPIKeySetup}
          onClose={() => setShowAPIKeySetup(false)}
          onComplete={handleAPIKeySetupComplete}
        />
      </>
    );
  }

  // Enabled but locked
  if (!isUnlocked) {
    return (
      <>
        <Button
          onClick={handleUnlock}
          secondary
          className="flex items-center gap-2 text-sm text-orange-600"
          title="Unlock encrypted mode"
        >
          <SvgLock className="w-4 h-4" />
          <span className="hidden sm:inline">Unlock</span>
        </Button>

        <EncryptionUnlockDialog
          isOpen={showUnlockDialog}
          onClose={() => setShowUnlockDialog(false)}
          onUnlockSuccess={handleUnlockSuccess}
          isNewSetup={false}
        />
      </>
    );
  }

  // Enabled and unlocked
  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          onClick={() => setShowSettings(true)}
          secondary
          className="flex items-center gap-2 text-sm text-green-600"
          title="Encrypted mode active - click for settings"
        >
          <SvgUnlock className="w-4 h-4" />
          <span className="hidden sm:inline">Encrypted</span>
        </Button>
        <Button
          onClick={() => setShowSettings(true)}
          secondary
          className="p-1"
          title="Encrypted mode settings"
        >
          <SvgSettings className="w-4 h-4" />
        </Button>
      </div>

      <EncryptedModeSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSetupAPIKey={() => {
          setShowSettings(false);
          setShowAPIKeySetup(true);
        }}
        onLock={handleLock}
        onDisableEncryptedMode={handleDisableEncryptedMode}
      />

      <APIKeySetup
        isOpen={showAPIKeySetup}
        onClose={() => setShowAPIKeySetup(false)}
        onComplete={handleAPIKeySetupComplete}
      />
    </>
  );
}
