/**
 * Web Crypto API-based encryption module for end-to-end encrypted chat
 *
 * Uses:
 * - PBKDF2 with 100,000 iterations for key derivation
 * - AES-GCM (256-bit) for authenticated encryption
 */

import {
  EncryptedBlob,
  ENCRYPTION_VERSION,
  EncryptionError,
  EncryptionErrorType,
} from "./types";

/** Number of PBKDF2 iterations for key derivation */
const PBKDF2_ITERATIONS = 100_000;

/** Salt length in bytes */
const SALT_LENGTH = 16;

/** IV length in bytes for AES-GCM */
const IV_LENGTH = 12;

/** AES key length in bits */
const AES_KEY_LENGTH = 256;

/**
 * Convert a Uint8Array to a base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert a base64 string to a Uint8Array
 */
export function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate a cryptographically random salt
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Generate a cryptographically random IV for AES-GCM
 */
export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Derive an AES-GCM key from a password using PBKDF2
 *
 * @param password - User's encryption password
 * @param salt - Salt for key derivation (should be stored with encrypted data)
 * @returns A CryptoKey suitable for AES-GCM encryption/decryption
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  try {
    // Import password as a key for PBKDF2
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    // Derive the actual encryption key
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      passwordKey,
      {
        name: "AES-GCM",
        length: AES_KEY_LENGTH,
      },
      false, // Not extractable for security
      ["encrypt", "decrypt"]
    );

    return derivedKey;
  } catch (error) {
    throw new EncryptionError(
      EncryptionErrorType.KEY_DERIVATION_FAILED,
      `Failed to derive key: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Encrypt data using AES-GCM
 *
 * @param data - Plain text data to encrypt
 * @param key - CryptoKey derived from user's password
 * @param existingSalt - Optional salt to reuse (for updating existing data)
 * @returns EncryptedBlob containing ciphertext and metadata
 */
export async function encrypt(
  data: string,
  key: CryptoKey,
  existingSalt?: Uint8Array
): Promise<EncryptedBlob> {
  try {
    const salt = existingSalt ?? generateSalt();
    const iv = generateIV();
    const encodedData = new TextEncoder().encode(data);

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      encodedData
    );

    return {
      version: ENCRYPTION_VERSION,
      salt: arrayBufferToBase64(salt),
      iv: arrayBufferToBase64(iv),
      ciphertext: arrayBufferToBase64(ciphertext),
    };
  } catch (error) {
    throw new EncryptionError(
      EncryptionErrorType.ENCRYPTION_FAILED,
      `Failed to encrypt data: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Decrypt data using AES-GCM
 *
 * @param blob - Encrypted blob containing ciphertext and metadata
 * @param key - CryptoKey derived from user's password
 * @returns Decrypted plain text
 */
export async function decrypt(
  blob: EncryptedBlob,
  key: CryptoKey
): Promise<string> {
  // Check version compatibility
  if (blob.version > ENCRYPTION_VERSION) {
    throw new EncryptionError(
      EncryptionErrorType.UNSUPPORTED_VERSION,
      `Unsupported encryption version: ${blob.version}. Maximum supported: ${ENCRYPTION_VERSION}`
    );
  }

  try {
    const iv = base64ToArrayBuffer(blob.iv);
    const ciphertext = base64ToArrayBuffer(blob.ciphertext);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    // AES-GCM throws an error on authentication failure (wrong key/corrupted data)
    if (
      error instanceof DOMException &&
      error.name === "OperationError"
    ) {
      throw new EncryptionError(
        EncryptionErrorType.WRONG_PASSWORD,
        "Decryption failed: incorrect password or corrupted data"
      );
    }
    throw new EncryptionError(
      EncryptionErrorType.DECRYPTION_FAILED,
      `Failed to decrypt data: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Encrypt a session data object
 *
 * @param data - Session data to encrypt
 * @param key - Derived encryption key
 * @param existingSalt - Optional salt to reuse
 * @returns Encrypted blob
 */
export async function encryptSessionData<T>(
  data: T,
  key: CryptoKey,
  existingSalt?: Uint8Array
): Promise<EncryptedBlob> {
  const serialized = JSON.stringify(data);
  return encrypt(serialized, key, existingSalt);
}

/**
 * Decrypt a session data blob
 *
 * @param blob - Encrypted blob
 * @param key - Derived encryption key
 * @returns Decrypted and parsed session data
 */
export async function decryptSessionData<T>(
  blob: EncryptedBlob,
  key: CryptoKey
): Promise<T> {
  const decrypted = await decrypt(blob, key);
  try {
    return JSON.parse(decrypted) as T;
  } catch (error) {
    throw new EncryptionError(
      EncryptionErrorType.INVALID_DATA,
      "Failed to parse decrypted data as JSON"
    );
  }
}

/**
 * Serialize an EncryptedBlob to a single base64 string for storage
 */
export function serializeEncryptedBlob(blob: EncryptedBlob): string {
  return btoa(JSON.stringify(blob));
}

/**
 * Deserialize a base64 string back to an EncryptedBlob
 */
export function deserializeEncryptedBlob(serialized: string): EncryptedBlob {
  try {
    const parsed = JSON.parse(atob(serialized));
    if (
      typeof parsed.version !== "number" ||
      typeof parsed.salt !== "string" ||
      typeof parsed.iv !== "string" ||
      typeof parsed.ciphertext !== "string"
    ) {
      throw new Error("Invalid blob structure");
    }
    return parsed as EncryptedBlob;
  } catch (error) {
    throw new EncryptionError(
      EncryptionErrorType.INVALID_DATA,
      "Failed to deserialize encrypted blob"
    );
  }
}

/**
 * Verify that a password can decrypt a blob (for password validation)
 *
 * @param blob - Encrypted blob to test
 * @param password - Password to test
 * @returns True if password is correct, false otherwise
 */
export async function verifyPassword(
  blob: EncryptedBlob,
  password: string
): Promise<boolean> {
  try {
    const salt = base64ToArrayBuffer(blob.salt);
    const key = await deriveKey(password, salt);
    await decrypt(blob, key);
    return true;
  } catch (error) {
    if (
      error instanceof EncryptionError &&
      error.type === EncryptionErrorType.WRONG_PASSWORD
    ) {
      return false;
    }
    throw error;
  }
}
