/**
 * Password strength validation for encrypted chat mode
 *
 * Provides utilities to validate encryption password strength
 * and provide helpful feedback to users.
 */

/** Minimum password length requirement */
export const MIN_PASSWORD_LENGTH = 12;

/** Minimum entropy bits for a strong password */
const MIN_ENTROPY_BITS = 40;

/**
 * Result of password validation
 */
export interface PasswordValidationResult {
  /** Whether the password meets all requirements */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of warnings (recommendations, not requirements) */
  warnings: string[];
  /** Estimated password strength (0-100) */
  strength: number;
  /** Human-readable strength label */
  strengthLabel: "weak" | "fair" | "good" | "strong" | "very_strong";
}

/**
 * Common password patterns to check against
 */
const COMMON_PATTERNS = [
  /^(.)\1+$/, // All same character
  /^(012|123|234|345|456|567|678|789|890)+$/, // Sequential numbers
  /^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)+$/i, // Sequential letters
  /^(qwerty|asdf|zxcv|password|letmein|welcome|admin)/i, // Common weak patterns
];

/**
 * Estimate the entropy of a password in bits
 *
 * @param password - Password to analyze
 * @returns Estimated entropy in bits
 */
function estimateEntropy(password: string): number {
  let charsetSize = 0;

  // Check character classes present
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 32; // Special chars

  if (charsetSize === 0) return 0;

  // Entropy = length * log2(charsetSize)
  return password.length * Math.log2(charsetSize);
}

/**
 * Calculate password strength score (0-100)
 *
 * @param password - Password to analyze
 * @returns Strength score 0-100
 */
function calculateStrength(password: string): number {
  let score = 0;

  // Length contribution (up to 40 points)
  score += Math.min(password.length * 2, 40);

  // Character variety (up to 30 points)
  if (/[a-z]/.test(password)) score += 7;
  if (/[A-Z]/.test(password)) score += 8;
  if (/[0-9]/.test(password)) score += 7;
  if (/[^a-zA-Z0-9]/.test(password)) score += 8;

  // Entropy bonus (up to 20 points)
  const entropy = estimateEntropy(password);
  score += Math.min(entropy / 3, 20);

  // Penalties
  // Repeated characters
  const repeats = password.match(/(.)\1{2,}/g);
  if (repeats) {
    score -= repeats.length * 5;
  }

  // Common patterns
  for (const pattern of COMMON_PATTERNS) {
    if (pattern.test(password)) {
      score -= 20;
      break;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Get strength label from score
 */
function getStrengthLabel(
  score: number
): "weak" | "fair" | "good" | "strong" | "very_strong" {
  if (score < 30) return "weak";
  if (score < 50) return "fair";
  if (score < 70) return "good";
  if (score < 90) return "strong";
  return "very_strong";
}

/**
 * Validate an encryption password
 *
 * @param password - Password to validate
 * @returns Validation result with errors and strength assessment
 */
export function validateEncryptionPassword(
  password: string
): PasswordValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check minimum length
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`
    );
  }

  // Check for lowercase letters
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  // Check for uppercase letters
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  // Check for numbers
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  // Check entropy (warning only)
  const entropy = estimateEntropy(password);
  if (entropy < MIN_ENTROPY_BITS) {
    warnings.push(
      "Consider using a longer password or adding special characters for better security"
    );
  }

  // Check for common patterns (warning only)
  for (const pattern of COMMON_PATTERNS) {
    if (pattern.test(password)) {
      warnings.push(
        "Password contains a common pattern. Consider using a more unique combination"
      );
      break;
    }
  }

  // Check for repeated characters
  if (/(.)\1{3,}/.test(password)) {
    warnings.push(
      "Password contains repeated characters. Consider more variation"
    );
  }

  const strength = calculateStrength(password);
  const strengthLabel = getStrengthLabel(strength);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    strength,
    strengthLabel,
  };
}

/**
 * Generate a strong random password
 * This can be used to suggest a secure password to users
 *
 * @param length - Password length (default 16)
 * @returns A randomly generated strong password
 */
export function generateStrongPassword(length: number = 16): string {
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const special = "!@#$%^&*()-_=+[]{}|;:,.<>?";

  const allChars = lowercase + uppercase + numbers + special;

  // Ensure at least one of each type
  let password = "";
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

/**
 * Check if two passwords match (for confirmation)
 *
 * @param password - Primary password
 * @param confirmation - Confirmation password
 * @returns True if they match
 */
export function passwordsMatch(
  password: string,
  confirmation: string
): boolean {
  return password === confirmation;
}
