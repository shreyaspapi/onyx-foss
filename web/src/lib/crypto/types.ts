/**
 * Types for end-to-end encrypted chat sessions
 */

import { Message, ChatSession } from "@/app/chat/interfaces";

/**
 * Version of the encryption format.
 * Increment when making breaking changes to the encryption scheme.
 */
export const ENCRYPTION_VERSION = 1;

/**
 * Encrypted blob containing ciphertext and associated metadata
 */
export interface EncryptedBlob {
  /** Encryption format version for future algorithm upgrades */
  version: number;
  /** Base64 encoded salt used for key derivation */
  salt: string;
  /** Base64 encoded initialization vector for AES-GCM */
  iv: string;
  /** Base64 encoded encrypted data */
  ciphertext: string;
}

/**
 * An encrypted chat session as stored on the server
 */
export interface EncryptedChatSession {
  /** Unique session identifier */
  sessionId: string;
  /** The encrypted blob containing the full session data */
  encryptedData: EncryptedBlob;
  /** ISO timestamp of session creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Optional encrypted session name for display in sidebar */
  encryptedName?: EncryptedBlob;
}

/**
 * Metadata about an encrypted session (non-sensitive)
 */
export interface SessionMetadata {
  /** Display name for the session */
  name: string;
  /** Persona/assistant ID used in this session */
  personaId: number;
  /** Optional project ID */
  projectId?: number | null;
}

/**
 * LLM configuration for encrypted mode
 */
export interface EncryptedLLMConfig {
  /** LLM provider identifier */
  provider: "openai" | "anthropic" | "azure" | "ollama" | "google";
  /** Model name/version */
  modelName: string;
  /** API base URL (for custom endpoints) */
  apiBase?: string;
  /** Temperature setting */
  temperature: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
}

/**
 * Decrypted session data structure
 */
export interface DecryptedSessionData {
  /** All messages in the chat session */
  messages: Message[];
  /** Session metadata */
  metadata: SessionMetadata;
  /** LLM configuration */
  llmConfig?: EncryptedLLMConfig;
}

/**
 * Request to create a new encrypted session
 */
export interface CreateEncryptedSessionRequest {
  /** Base64 encoded encrypted data blob */
  encryptedData: string;
  /** Encryption format version */
  encryptionVersion: number;
  /** Optional base64 encoded encrypted session name */
  encryptedName?: string;
}

/**
 * Request to update an encrypted session
 */
export interface UpdateEncryptedSessionRequest {
  /** Base64 encoded encrypted data blob */
  encryptedData: string;
  /** Optional base64 encoded encrypted session name */
  encryptedName?: string;
}

/**
 * Response from encrypted session API
 */
export interface EncryptedSessionResponse {
  /** Session ID */
  sessionId: string;
  /** Base64 encoded encrypted data */
  encryptedData: string;
  /** Encryption version */
  encryptionVersion: number;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Optional base64 encoded encrypted name */
  encryptedName?: string;
}

/**
 * List item for encrypted sessions (minimal data for sidebar)
 */
export interface EncryptedSessionListItem {
  /** Session ID */
  sessionId: string;
  /** Optional base64 encoded encrypted name */
  encryptedName?: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

/**
 * Request to store an encrypted secret (API key)
 */
export interface StoreSecretRequest {
  /** Type of secret being stored */
  secretType: string;
  /** Base64 encoded encrypted value */
  encryptedValue: string;
  /** Base64 encoded salt for key derivation */
  salt: string;
  /** Base64 encoded IV */
  iv: string;
  /** Encryption version */
  version: number;
}

/**
 * Response when retrieving an encrypted secret
 */
export interface EncryptedSecretResponse {
  /** Type of secret */
  secretType: string;
  /** Base64 encoded encrypted value */
  encryptedValue: string;
  /** Base64 encoded salt */
  salt: string;
  /** Base64 encoded IV */
  iv: string;
  /** Encryption version */
  version: number;
}

/**
 * Supported secret types for encrypted storage
 */
export enum SecretType {
  LLM_API_KEY = "llm_api_key",
  OPENAI_API_KEY = "openai_api_key",
  ANTHROPIC_API_KEY = "anthropic_api_key",
  AZURE_API_KEY = "azure_api_key",
  GOOGLE_API_KEY = "google_api_key",
}

/**
 * State of the encrypted mode
 */
export interface EncryptedModeState {
  /** Whether encrypted mode is enabled */
  isEnabled: boolean;
  /** Whether the session is currently unlocked */
  isUnlocked: boolean;
  /** Current session ID if in an encrypted session */
  currentSessionId?: string;
}

/**
 * Error types specific to encryption operations
 */
export enum EncryptionErrorType {
  WRONG_PASSWORD = "wrong_password",
  DECRYPTION_FAILED = "decryption_failed",
  KEY_DERIVATION_FAILED = "key_derivation_failed",
  ENCRYPTION_FAILED = "encryption_failed",
  UNSUPPORTED_VERSION = "unsupported_version",
  INVALID_DATA = "invalid_data",
}

/**
 * Error thrown by encryption operations
 */
export class EncryptionError extends Error {
  type: EncryptionErrorType;

  constructor(type: EncryptionErrorType, message: string) {
    super(message);
    this.name = "EncryptionError";
    this.type = type;
  }
}
