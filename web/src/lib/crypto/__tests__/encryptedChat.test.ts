/**
 * Unit tests for the encryption module
 */

import {
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
} from "../encryptedChat";
import { EncryptedBlob, EncryptionError, EncryptionErrorType, ENCRYPTION_VERSION } from "../types";

// Mock Web Crypto API for Node.js environment
const cryptoMock = {
  getRandomValues: (array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  },
  subtle: {
    importKey: jest.fn(),
    deriveKey: jest.fn(),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  },
};

// @ts-ignore - Mock global crypto
global.crypto = cryptoMock as unknown as Crypto;

describe("Encryption Module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("arrayBufferToBase64 and base64ToArrayBuffer", () => {
    it("should convert Uint8Array to base64 and back", () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 100, 200, 255]);
      const base64 = arrayBufferToBase64(original);
      const result = base64ToArrayBuffer(base64);

      expect(result).toEqual(original);
    });

    it("should handle empty arrays", () => {
      const empty = new Uint8Array([]);
      const base64 = arrayBufferToBase64(empty);
      const result = base64ToArrayBuffer(base64);

      expect(result.length).toBe(0);
    });

    it("should produce valid base64 strings", () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const base64 = arrayBufferToBase64(data);

      // Base64 should only contain valid characters
      expect(base64).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    });
  });

  describe("generateSalt", () => {
    it("should generate a salt of correct length", () => {
      const salt = generateSalt();
      expect(salt.length).toBe(16); // SALT_LENGTH
    });

    it("should generate different salts each time", () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();

      // Extremely unlikely to be equal with random values
      const areEqual = salt1.every((val, i) => val === salt2[i]);
      expect(areEqual).toBe(false);
    });
  });

  describe("generateIV", () => {
    it("should generate an IV of correct length", () => {
      const iv = generateIV();
      expect(iv.length).toBe(12); // IV_LENGTH for AES-GCM
    });
  });

  describe("serializeEncryptedBlob and deserializeEncryptedBlob", () => {
    it("should serialize and deserialize an encrypted blob", () => {
      const blob: EncryptedBlob = {
        version: ENCRYPTION_VERSION,
        salt: "dGVzdHNhbHQ=",
        iv: "dGVzdGl2",
        ciphertext: "ZW5jcnlwdGVkZGF0YQ==",
      };

      const serialized = serializeEncryptedBlob(blob);
      expect(typeof serialized).toBe("string");

      const deserialized = deserializeEncryptedBlob(serialized);
      expect(deserialized).toEqual(blob);
    });

    it("should throw on invalid serialized data", () => {
      expect(() => {
        deserializeEncryptedBlob("invalid base64!@#");
      }).toThrow(EncryptionError);
    });

    it("should throw on missing required fields", () => {
      const invalid = btoa(JSON.stringify({ version: 1 }));

      expect(() => {
        deserializeEncryptedBlob(invalid);
      }).toThrow(EncryptionError);
    });
  });

  describe("EncryptedBlob structure", () => {
    it("should have the correct structure", () => {
      const blob: EncryptedBlob = {
        version: 1,
        salt: "test",
        iv: "test",
        ciphertext: "test",
      };

      expect(blob.version).toBeDefined();
      expect(blob.salt).toBeDefined();
      expect(blob.iv).toBeDefined();
      expect(blob.ciphertext).toBeDefined();
    });
  });
});

describe("EncryptionError", () => {
  it("should create error with correct type and message", () => {
    const error = new EncryptionError(
      EncryptionErrorType.WRONG_PASSWORD,
      "Test message"
    );

    expect(error.name).toBe("EncryptionError");
    expect(error.type).toBe(EncryptionErrorType.WRONG_PASSWORD);
    expect(error.message).toBe("Test message");
  });

  it("should be instanceof Error", () => {
    const error = new EncryptionError(
      EncryptionErrorType.DECRYPTION_FAILED,
      "Test"
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(EncryptionError);
  });
});

describe("ENCRYPTION_VERSION", () => {
  it("should be a positive integer", () => {
    expect(ENCRYPTION_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(ENCRYPTION_VERSION)).toBe(true);
  });
});
