// ============================================================================
// MB CRUNCHY — Indian Phone Number Normalization & Validation
// ============================================================================
//
// Canonical internal format: +91XXXXXXXXXX
//   where XXXXXXXXXX is exactly 10 digits starting with 6, 7, 8, or 9.
//
// This utility is duplicated in src/utils/phone.ts for the frontend.
// Both copies must stay in sync.
// ============================================================================

const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

// Obvious repeated-digit junk: all 10 digits the same
const REPEATED_DIGIT_REGEX = /^(\d)\1{9}$/;

// Obvious sequential junk: 1234567890 and 0987654321
const SEQUENTIAL_JUNK = new Set(["1234567890", "0987654321"]);

/**
 * Strip everything except digits from the input string.
 */
function stripNonDigits(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Attempt to extract a 10-digit Indian mobile number from arbitrary input.
 *
 * Handles:
 *   8801756151       → 8801756151
 *   +918801756151    → 8801756151
 *   918801756151     → 8801756151
 *   08801756151      → 8801756151  (leading zero stripped)
 *   +91 88017 56151  → 8801756151
 *
 * Returns the 10-digit string or null if extraction fails.
 */
function extract10Digit(input: string): string | null {
  const digits = stripNonDigits(input);

  // Direct 10-digit match
  if (digits.length === 10) return digits;

  // With country code: 91XXXXXXXXXX (12 digits) or 0XXXXXXXXXX (11 digits with leading 0)
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }

  return null;
}

/**
 * Validate whether a 10-digit string is a plausible Indian mobile number.
 *
 * Rejects:
 *   - Numbers not starting with 6-9
 *   - Repeated-digit junk (9999999999, 8888888888, etc.)
 *   - Sequential junk (1234567890)
 */
function isValid10Digit(digits: string): boolean {
  if (!INDIAN_PHONE_REGEX.test(digits)) return false;
  if (REPEATED_DIGIT_REGEX.test(digits)) return false;
  if (SEQUENTIAL_JUNK.has(digits)) return false;
  return true;
}

/**
 * Normalize any reasonable phone input to the canonical +91XXXXXXXXXX format.
 *
 * Returns the canonical string on success, or null if the input cannot be
 * normalized to a valid Indian mobile number.
 */
export function normalizeIndianPhone(input: string): string | null {
  const digits = extract10Digit(input);
  if (!digits) return null;
  if (!isValid10Digit(digits)) return null;
  return `+91${digits}`;
}

/**
 * Validate that the input is a valid Indian mobile number.
 * Returns true if and only if normalizeIndianPhone would return a value.
 */
export function validateIndianPhone(input: string): boolean {
  return normalizeIndianPhone(input) !== null;
}

/**
 * Format a canonical +91XXXXXXXXXX number for display.
 *
 * Example: +918801756151 → "+91 88017 56151"
 */
export function formatIndianPhoneForDisplay(phone: string): string {
  const digits = stripNonDigits(phone);
  if (digits.length === 12 && digits.startsWith("91")) {
    const d = digits.slice(2);
    return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}

/**
 * Strip the country code and return just the 10-digit number.
 * Useful for wa.me links and display where +91 is already implied.
 */
export function stripCountryCode(phone: string): string {
  const digits = stripNonDigits(phone);
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 10) {
    return digits;
  }
  return digits;
}

/**
 * Normalize and validate a phone number, throwing if invalid.
 *
 * Use this in mutations/actions where an invalid phone must be rejected
 * rather than silently stored. Returns the canonical +91XXXXXXXXXX string.
 *
 * @throws {Error} if the input cannot be normalized to a valid Indian mobile.
 */
export function requireIndianPhone(input: string): string {
  const normalized = normalizeIndianPhone(input);
  if (!normalized) {
    throw new Error(
      "Invalid phone number. Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9."
    );
  }
  return normalized;
}
