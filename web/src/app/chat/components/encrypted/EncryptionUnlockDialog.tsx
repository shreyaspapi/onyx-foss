"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Modal from "@/refresh-components/Modal";
import Button from "@/refresh-components/buttons/Button";
import FieldInput from "@/refresh-components/inputs/FieldInput";
import { useKeyPress } from "@/hooks/useKeyPress";
import {
  validateEncryptionPassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/crypto/passwordValidation";
import { SvgLock } from "@opal/icons";

export interface EncryptionUnlockDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when unlock is attempted */
  onUnlock: (password: string) => Promise<boolean>;
  /** Callback when dialog is cancelled */
  onCancel: () => void;
  /** Whether this is a new session (shows password confirmation) */
  isNewSession: boolean;
  /** Error message to display */
  error?: string | null;
}

export default function EncryptionUnlockDialog({
  isOpen,
  onUnlock,
  onCancel,
  isNewSession,
  error: externalError,
}: EncryptionUnlockDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Focus password input when dialog opens
  useEffect(() => {
    if (isOpen && passwordRef.current) {
      passwordRef.current.focus();
    }
  }, [isOpen]);

  // Clear state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setPassword("");
      setConfirmPassword("");
      setError(null);
      setShowValidation(false);
    }
  }, [isOpen]);

  // Update error from external source
  useEffect(() => {
    if (externalError) {
      setError(externalError);
    }
  }, [externalError]);

  const validation = validateEncryptionPassword(password);

  const handleSubmit = useCallback(async () => {
    setError(null);

    // Validate password for new sessions
    if (isNewSession) {
      if (!validation.valid) {
        setShowValidation(true);
        setError("Please fix the password issues above");
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    if (!password) {
      setError("Password is required");
      return;
    }

    setIsLoading(true);

    try {
      const success = await onUnlock(password);
      if (!success) {
        setError("Incorrect password");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlock");
    } finally {
      setIsLoading(false);
    }
  }, [password, confirmPassword, isNewSession, validation, onUnlock]);

  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Enter" && !isLoading) {
        handleSubmit();
      }
    },
    [handleSubmit, isLoading]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyPress);
      return () => document.removeEventListener("keydown", handleKeyPress);
    }
  }, [isOpen, handleKeyPress]);

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <Modal.Content mini>
        <Modal.Header
          icon={SvgLock}
          title={isNewSession ? "Create Encryption Password" : "Unlock Encrypted Chat"}
          onClose={onCancel}
        />

        <Modal.Body className="flex flex-col gap-4 p-4">
          {isNewSession && (
            <p className="text-sm text-text-muted">
              Create a password to encrypt your chat history. This password will
              be used to encrypt your messages and API keys. Make sure to
              remember it - there is no way to recover your data without it.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              {isNewSession ? "Create Password" : "Enter Password"}
            </label>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder={`Enter password (min ${MIN_PASSWORD_LENGTH} characters)`}
              className="px-3 py-2 border rounded-md bg-background text-text focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            />

            {isNewSession && showValidation && validation.errors.length > 0 && (
              <ul className="text-xs text-red-500 list-disc list-inside">
                {validation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}

            {isNewSession && password && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      validation.strength < 30
                        ? "bg-red-500"
                        : validation.strength < 50
                          ? "bg-orange-500"
                          : validation.strength < 70
                            ? "bg-yellow-500"
                            : validation.strength < 90
                              ? "bg-green-500"
                              : "bg-emerald-500"
                    }`}
                    style={{ width: `${validation.strength}%` }}
                  />
                </div>
                <span className="text-xs text-text-muted capitalize">
                  {validation.strengthLabel.replace("_", " ")}
                </span>
              </div>
            )}
          </div>

          {isNewSession && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                }}
                placeholder="Confirm your password"
                className="px-3 py-2 border rounded-md bg-background text-text focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {isNewSession && validation.warnings.length > 0 && !showValidation && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <ul className="text-xs text-yellow-700 list-disc list-inside">
                {validation.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          )}
        </Modal.Body>

        <Modal.Footer className="flex flex-row p-4 items-center justify-end w-full gap-2">
          <Button onClick={onCancel} secondary disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading
              ? "Processing..."
              : isNewSession
                ? "Create & Unlock"
                : "Unlock"}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal>
  );
}
