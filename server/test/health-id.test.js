// Tests for the Health ID generator and Luhn check digit (no database needed).
import './guard.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { luhnCheckDigit, generateHealthId, isValidHealthId } from '../src/patients/health-id.js';

test('Luhn check digit matches the standard textbook example', () => {
  // 7992739871 -> check digit 3 is the classic published Luhn example
  assert.equal(luhnCheckDigit('7992739871'), 3);
  assert.equal(luhnCheckDigit('123456'), 6);
});

test('generated Health IDs have the DEMO format and a valid check digit', () => {
  for (let i = 0; i < 1000; i++) {
    const id = generateHealthId();
    assert.match(id, /^DEMO-\d{6}-\d$/);
    assert.ok(isValidHealthId(id), `${id} should be valid`);
  }
});

test('every single wrong digit is detected', () => {
  const valid = 'DEMO-123456-6';
  const chars = [...valid];
  // Positions of the 7 digits (6 digits + check digit)
  const digitPositions = [5, 6, 7, 8, 9, 10, 12];

  for (const pos of digitPositions) {
    for (let d = 0; d <= 9; d++) {
      if (String(d) === chars[pos]) continue;
      const typo = [...chars];
      typo[pos] = String(d);
      assert.equal(isValidHealthId(typo.join('')), false, `${typo.join('')} should be invalid`);
    }
  }
});

test('swapping two neighbouring digits is detected (except the known Luhn limits)', () => {
  for (let n = 0; n < 2000; n++) {
    const id = generateHealthId();
    const digits = id.slice(5, 11);
    const checkDigit = id.slice(12);

    for (let i = 0; i < digits.length - 1; i++) {
      const a = digits[i];
      const b = digits[i + 1];
      // Skip the two cases Luhn cannot catch (see DESIGN.md section 1):
      // - equal digits (e.g. 44): swapping them gives the same number, so it is not an error
      // - 0 and 9 (09 <-> 90): both digits add the same amount to the Luhn sum
      //   whether doubled or not (0 -> 0, 9 -> 18 -> 9), so the check digit stays the same
      if (a === b) continue;
      if ((a === '0' && b === '9') || (a === '9' && b === '0')) continue;

      const swapped = digits.slice(0, i) + b + a + digits.slice(i + 2);
      const typo = `DEMO-${swapped}-${checkDigit}`;
      assert.equal(isValidHealthId(typo), false, `${id} -> ${typo} should be detected`);
    }
  }
});

test('known Luhn limit: swapping 09 <-> 90 is NOT detected', () => {
  // This test documents the limit. If it ever fails, the algorithm changed.
  assert.equal(luhnCheckDigit('090000'), luhnCheckDigit('900000'));
  assert.equal(luhnCheckDigit('123090'), luhnCheckDigit('123900'));
});

test('wrong formats are rejected', () => {
  const bad = [
    'DEMO-12345-6',   // 5 digits
    'DEMO-1234567-6', // 7 digits
    'demo-123456-6',  // lowercase prefix
    '123456-6',       // no prefix
    'DEMO-123456-6 ', // trailing space
    'DEMO-123456',    // no check digit
    '',
    null,
    undefined,
    123456,
  ];
  for (const value of bad) {
    assert.equal(isValidHealthId(value), false, `${JSON.stringify(value)} should be invalid`);
  }
});
