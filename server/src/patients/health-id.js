// Demo Health IDs (DESIGN.md section 1): DEMO- + 6 digits + - + Luhn check digit.
// Example: DEMO-123456-6. The DEMO prefix means it can never be mistaken for a real PHN.
import { randomInt } from 'node:crypto';

const HEALTH_ID_PATTERN = /^DEMO-(\d{6})-(\d)$/;

// Luhn check digit for a string of digits.
// From the rightmost digit, double every second digit (if the result is over 9,
// subtract 9), add everything up, and return the digit that makes the total
// a multiple of 10.
export function luhnCheckDigit(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10;
}

// A new random Health ID. Uniqueness is checked by the database
// (Patient.healthId is unique); registration retries on a clash.
export function generateHealthId() {
  const digits = String(randomInt(0, 1_000_000)).padStart(6, '0');
  return `DEMO-${digits}-${luhnCheckDigit(digits)}`;
}

// True only for the exact format with a correct check digit.
export function isValidHealthId(healthId) {
  if (typeof healthId !== 'string') return false;
  const match = HEALTH_ID_PATTERN.exec(healthId);
  if (!match) return false;
  const [, digits, checkDigit] = match;
  return luhnCheckDigit(digits) === Number(checkDigit);
}
