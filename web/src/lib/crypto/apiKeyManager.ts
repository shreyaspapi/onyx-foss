/**
 * API Key encryption and management for encrypted chat mode
 *
 * Handles encryption, storage, and retrieval of LLM API keys
 * using the user's encryption password.
 */

import {
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
  base64ToArrayBuffer,
  arrayBufferToBase64,
} from "./encryptedChat";
import {
  EncryptedBlob,
  SecretType,
  StoreSecretRequest,
  EncryptedSecretResponse,
  EncryptedLLMConfig,
  EncryptionError,
  EncryptionErrorType,
} from "./types";
import { getKeyManager } from "./keyManager";

/** API endpoints for encrypted secrets */
const SECRETS_API_BASE = "/api/encrypted-secrets";

/**
 * Store an encrypted API key on the server
 *
 * @param apiKey - The plain text API key to encrypt and store
 * @param password - User's encryption password
 * @param secretType - Type of secret (e.g., openai_api_key)
 */
export async function storeEncryptedAPIKey(
  apiKey: string,
  password: string,
  secretType: SecretType = SecretType.LLM_API_KEY
): Promise<void> {
  // Generate salt and derive key
  const salt = generateSalt();
  const key = await deriveKey(password, salt);

  // Encrypt the API key
  const encryptedBlob = await encrypt(apiKey, key, salt);

  // Send to server
  const request: StoreSecretRequest = {
    secretType,
    encryptedValue: encryptedBlob.ciphertext,
    salt: encryptedBlob.salt,
    iv: encryptedBlob.iv,
    version: encryptedBlob.version,
  };

  const response = await fetch(SECRETS_API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(`Failed to store encrypted secret: ${error.detail}`);
  }
}

/**
 * Retrieve and decrypt an API key from the server
 *
 * @param password - User's encryption password
 * @param secretType - Type of secret to retrieve
 * @returns The decrypted API key
 */
export async function getDecryptedAPIKey(
  password: string,
  secretType: SecretType = SecretType.LLM_API_KEY
): Promise<string> {
  // Fetch encrypted secret from server
  const response = await fetch(`${SECRETS_API_BASE}/${secretType}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new EncryptionError(
        EncryptionErrorType.INVALID_DATA,
        `No API key stored for type: ${secretType}`
      );
    }
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(`Failed to retrieve encrypted secret: ${error.detail}`);
  }

  const secretResponse: EncryptedSecretResponse = await response.json();

  // Reconstruct the encrypted blob
  const blob: EncryptedBlob = {
    version: secretResponse.version,
    salt: secretResponse.salt,
    iv: secretResponse.iv,
    ciphertext: secretResponse.encryptedValue,
  };

  // Derive key and decrypt
  const salt = base64ToArrayBuffer(blob.salt);
  const key = await deriveKey(password, salt);
  return await decrypt(blob, key);
}

/**
 * Delete an encrypted secret from the server
 *
 * @param secretType - Type of secret to delete
 */
export async function deleteEncryptedAPIKey(
  secretType: SecretType = SecretType.LLM_API_KEY
): Promise<void> {
  const response = await fetch(`${SECRETS_API_BASE}/${secretType}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 404) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(`Failed to delete encrypted secret: ${error.detail}`);
  }
}

/**
 * Check if an encrypted API key exists for the given type
 *
 * @param secretType - Type of secret to check
 * @returns True if the secret exists
 */
export async function hasEncryptedAPIKey(
  secretType: SecretType = SecretType.LLM_API_KEY
): Promise<boolean> {
  const response = await fetch(`${SECRETS_API_BASE}/${secretType}`, {
    method: "HEAD",
  });
  return response.ok;
}

/**
 * Store and encrypt a full LLM configuration
 *
 * @param config - LLM configuration including API key
 * @param password - User's encryption password
 */
export async function storeEncryptedLLMConfig(
  config: EncryptedLLMConfig & { apiKey: string },
  password: string
): Promise<void> {
  // Store the API key separately
  const secretType = getSecretTypeForProvider(config.provider);
  await storeEncryptedAPIKey(config.apiKey, password, secretType);

  // Store the config (without API key) in localStorage
  // The config itself isn't sensitive, only the API key is
  const configWithoutKey: EncryptedLLMConfig = {
    provider: config.provider,
    modelName: config.modelName,
    apiBase: config.apiBase,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(
      "onyx_encrypted_llm_config",
      JSON.stringify(configWithoutKey)
    );
  }
}

/**
 * Retrieve the stored LLM configuration (without API key)
 */
export function getStoredLLMConfig(): EncryptedLLMConfig | null {
  if (typeof localStorage === "undefined") return null;

  const stored = localStorage.getItem("onyx_encrypted_llm_config");
  if (!stored) return null;

  try {
    return JSON.parse(stored) as EncryptedLLMConfig;
  } catch {
    return null;
  }
}

/**
 * Get the full LLM configuration including decrypted API key
 *
 * @param password - User's encryption password
 * @returns Full LLM configuration with API key
 */
export async function getFullLLMConfig(
  password: string
): Promise<(EncryptedLLMConfig & { apiKey: string }) | null> {
  const config = getStoredLLMConfig();
  if (!config) return null;

  const secretType = getSecretTypeForProvider(config.provider);
  const apiKey = await getDecryptedAPIKey(password, secretType);

  return {
    ...config,
    apiKey,
  };
}

/**
 * Get the full LLM configuration using the key manager's stored key
 * This is for use when the key manager is already unlocked
 */
export async function getFullLLMConfigWithKeyManager(): Promise<
  (EncryptedLLMConfig & { apiKey: string }) | null
> {
  const keyManager = getKeyManager();
  if (!keyManager.isUnlocked()) {
    throw new EncryptionError(
      EncryptionErrorType.KEY_DERIVATION_FAILED,
      "Key manager is not unlocked"
    );
  }

  const config = getStoredLLMConfig();
  if (!config) return null;

  const secretType = getSecretTypeForProvider(config.provider);

  // Fetch the encrypted secret
  const response = await fetch(`${SECRETS_API_BASE}/${secretType}`);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error("Failed to fetch encrypted API key");
  }

  const secretResponse: EncryptedSecretResponse = await response.json();

  // Reconstruct and decrypt using the already-derived key
  const blob: EncryptedBlob = {
    version: secretResponse.version,
    salt: secretResponse.salt,
    iv: secretResponse.iv,
    ciphertext: secretResponse.encryptedValue,
  };

  const apiKey = await decrypt(blob, keyManager.getKey());

  return {
    ...config,
    apiKey,
  };
}

/**
 * Clear all stored LLM configuration
 */
export function clearLLMConfig(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("onyx_encrypted_llm_config");
  }
}

/**
 * Map LLM provider to secret type
 */
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
      // Ollama typically doesn't need an API key, but we still support it
      return SecretType.LLM_API_KEY;
    default:
      return SecretType.LLM_API_KEY;
  }
}
