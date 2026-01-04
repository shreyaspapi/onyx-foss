/**
 * Crypto module for end-to-end encrypted chat
 *
 * This module provides client-side encryption for chat sessions,
 * allowing users to have encrypted conversations where only they
 * can read the content (not even the server can decrypt it).
 */

// Core encryption functions
export {
  deriveKey,
  encrypt,
  decrypt,
  encryptSessionData,
  decryptSessionData,
  generateSalt,
  generateIV,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  serializeEncryptedBlob,
  deserializeEncryptedBlob,
  verifyPassword,
} from "./encryptedChat";

// Types
export {
  ENCRYPTION_VERSION,
  EncryptionError,
  EncryptionErrorType,
  SecretType,
  type EncryptedBlob,
  type EncryptedChatSession,
  type SessionMetadata,
  type EncryptedLLMConfig,
  type DecryptedSessionData,
  type CreateEncryptedSessionRequest,
  type UpdateEncryptedSessionRequest,
  type EncryptedSessionResponse,
  type EncryptedSessionListItem,
  type StoreSecretRequest,
  type EncryptedSecretResponse,
  type EncryptedModeState,
} from "./types";

// Key management
export {
  EncryptedModeKeyManager,
  getKeyManager,
  resetKeyManager,
} from "./keyManager";

// API key management
export {
  storeEncryptedAPIKey,
  getDecryptedAPIKey,
  deleteEncryptedAPIKey,
  hasEncryptedAPIKey,
  storeEncryptedLLMConfig,
  getStoredLLMConfig,
  getFullLLMConfig,
  getFullLLMConfigWithKeyManager,
  clearLLMConfig,
} from "./apiKeyManager";

// Password validation
export {
  validateEncryptionPassword,
  generateStrongPassword,
  passwordsMatch,
  MIN_PASSWORD_LENGTH,
  type PasswordValidationResult,
} from "./passwordValidation";

// Session timeout / auto-lock
export {
  SessionTimeoutManager,
  setupAutoLock,
  stopAutoLock,
  getTimeoutManager,
  DEFAULT_TIMEOUT_MINUTES,
  type SessionTimeoutConfig,
} from "./sessionTimeout";
