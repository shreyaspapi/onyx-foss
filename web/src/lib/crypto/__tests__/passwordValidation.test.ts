/**
 * Unit tests for password validation
 */

import {
  validateEncryptionPassword,
  generateStrongPassword,
  passwordsMatch,
  MIN_PASSWORD_LENGTH,
} from "../passwordValidation";

describe("Password Validation", () => {
  describe("MIN_PASSWORD_LENGTH", () => {
    it("should be at least 12 characters", () => {
      expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12);
    });
  });

  describe("validateEncryptionPassword", () => {
    it("should reject passwords shorter than minimum length", () => {
      const result = validateEncryptionPassword("Short1!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("at least")
      );
    });

    it("should reject passwords without lowercase letters", () => {
      const result = validateEncryptionPassword("ALLUPPER12345!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("lowercase")
      );
    });

    it("should reject passwords without uppercase letters", () => {
      const result = validateEncryptionPassword("alllower12345!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("uppercase")
      );
    });

    it("should reject passwords without numbers", () => {
      const result = validateEncryptionPassword("NoNumbersHere!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("number")
      );
    });

    it("should accept valid strong passwords", () => {
      const result = validateEncryptionPassword("StrongPass123!");

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should provide strength assessment", () => {
      const weakResult = validateEncryptionPassword("weak");
      const strongResult = validateEncryptionPassword("VeryStr0ng!Password#2024");

      expect(weakResult.strength).toBeLessThan(strongResult.strength);
    });

    it("should categorize strength correctly", () => {
      const result = validateEncryptionPassword("StrongPass123!");

      expect(["weak", "fair", "good", "strong", "very_strong"]).toContain(
        result.strengthLabel
      );
    });

    it("should warn about common patterns", () => {
      const result = validateEncryptionPassword("qwerty123456AB");

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("generateStrongPassword", () => {
    it("should generate password of specified length", () => {
      const password = generateStrongPassword(20);
      expect(password.length).toBe(20);
    });

    it("should generate password with default length of 16", () => {
      const password = generateStrongPassword();
      expect(password.length).toBe(16);
    });

    it("should generate passwords that pass validation", () => {
      const password = generateStrongPassword(16);
      const result = validateEncryptionPassword(password);

      expect(result.valid).toBe(true);
    });

    it("should include all character types", () => {
      const password = generateStrongPassword(20);

      expect(password).toMatch(/[a-z]/); // lowercase
      expect(password).toMatch(/[A-Z]/); // uppercase
      expect(password).toMatch(/[0-9]/); // numbers
      expect(password).toMatch(/[^a-zA-Z0-9]/); // special chars
    });

    it("should generate different passwords each time", () => {
      const password1 = generateStrongPassword();
      const password2 = generateStrongPassword();

      expect(password1).not.toBe(password2);
    });
  });

  describe("passwordsMatch", () => {
    it("should return true for matching passwords", () => {
      expect(passwordsMatch("test123", "test123")).toBe(true);
    });

    it("should return false for different passwords", () => {
      expect(passwordsMatch("test123", "test456")).toBe(false);
    });

    it("should be case sensitive", () => {
      expect(passwordsMatch("Test123", "test123")).toBe(false);
    });

    it("should handle empty strings", () => {
      expect(passwordsMatch("", "")).toBe(true);
      expect(passwordsMatch("", "test")).toBe(false);
    });
  });
});
