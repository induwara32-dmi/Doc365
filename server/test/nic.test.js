// Tests for NIC normalization and lookup by NIC.
import './guard.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { prisma } from '../src/db.js';
import { normalizeNic } from '../src/patients/nic.js';
import { findPatientByNic } from '../src/patients/patient-service.js';
import { AppError } from '../src/errors.js';

after(async () => {
  await prisma.$disconnect();
});

// Checks that normalizeNic throws AppError INVALID_NIC
function assertInvalid(input) {
  assert.throws(
    () => normalizeNic(input),
    (err) => err instanceof AppError && err.code === 'INVALID_NIC',
    `${JSON.stringify(input)} should be rejected`,
  );
}

test('the official DRP example converts by the rule text', () => {
  // drp.gov.lk FAQ: old 855420159v -> new "19 85542 0 159".
  // That printed example has only 11 digits (a typo on the official page).
  // The rule text says: drop V/X, add "0" before the last 4 digits, start with 19:
  //   19 + 85542 + 0 + 0159 = 198554200159 (12 digits). We follow the rule text.
  assert.equal(normalizeNic('DEMO-NIC-855420159V'), 'DEMO-NIC-198554200159');
});

test('old NICs: any case of V/X, spaces around are trimmed', () => {
  assert.equal(normalizeNic('DEMO-NIC-855420159v'), 'DEMO-NIC-198554200159');
  assert.equal(normalizeNic('DEMO-NIC-855420159X'), 'DEMO-NIC-198554200159');
  assert.equal(normalizeNic('  DEMO-NIC-855420159x  '), 'DEMO-NIC-198554200159');
  assert.equal(normalizeNic('DEMO-NIC-751234567V'), 'DEMO-NIC-197512304567');
});

test('the check digit (last digit) stays the same', () => {
  const old = 'DEMO-NIC-855420159V';
  const converted = normalizeNic(old);
  assert.equal(converted.at(-1), old.at(-2)); // last digit before the V
});

test('new 12-digit NICs are kept as they are, and old and new forms match', () => {
  assert.equal(normalizeNic('DEMO-NIC-198554200159'), 'DEMO-NIC-198554200159');
  assert.equal(normalizeNic('DEMO-NIC-200812345678'), 'DEMO-NIC-200812345678');
  assert.equal(normalizeNic('DEMO-NIC-855420159V'), normalizeNic('DEMO-NIC-198554200159'));
});

test('day-of-year: 001-366 (men) and 501-866 (women) are valid, others are not', () => {
  for (const day of ['001', '366', '501', '866']) {
    assert.ok(normalizeNic(`DEMO-NIC-85${day}0159V`), `old, day ${day}`);
    assert.ok(normalizeNic(`DEMO-NIC-1985${day}00159`), `new, day ${day}`);
  }
  for (const day of ['000', '367', '500', '867', '999']) {
    assertInvalid(`DEMO-NIC-85${day}0159V`);
    assertInvalid(`DEMO-NIC-1985${day}00159`);
  }
});

test('invalid NICs are rejected with INVALID_NIC, never saved unchanged', () => {
  const bad = [
    '855420159V',              // no DEMO-NIC- prefix (looks like a real NIC)
    '198554200159',            // no prefix, new form
    'demo-nic-855420159V',     // prefix in wrong case
    'DEMO-NIC-85542015V',      // 8 digits + V
    'DEMO-NIC-8554201590V',    // 10 digits + V
    'DEMO-NIC-855420159A',     // wrong letter
    'DEMO-NIC-855420159',      // 9 digits, no letter
    'DEMO-NIC-19855420015',    // 11 digits (like the DRP typo)
    'DEMO-NIC-1985542001590',  // 13 digits
    'DEMO-NIC-85542 0159V',    // space inside
    'DEMO-NIC-',
    '',
    null,
    undefined,
    855420159,
  ];
  for (const value of bad) assertInvalid(value);
});

test('error messages say what is wrong', () => {
  assert.throws(() => normalizeNic('855420159V'), /must start with DEMO-NIC-/);
  assert.throws(() => normalizeNic('DEMO-NIC-12345'), /9 digits \+ V\/X \(old\) or 12 digits/);
  assert.throws(() => normalizeNic('DEMO-NIC-850000159V'), /day-of-year 000 is not valid/);
});

test('searching by the old NIC finds a patient saved with the new NIC', async () => {
  // Random NIC so test runs never clash (test data is never deleted)
  const yy = String(randomInt(0, 100)).padStart(2, '0');
  const day = String(randomInt(1, 367)).padStart(3, '0');
  const serial = String(randomInt(0, 10000)).padStart(4, '0');
  const oldNic = `DEMO-NIC-${yy}${day}${serial}V`;

  const patient = await prisma.patient.create({
    data: {
      healthId: `DEMO-TEST-${randomUUID()}`,
      nic: normalizeNic(oldNic), // saved in the new form
      dateOfBirth: new Date('1985-01-01'),
      fhir: { resourceType: 'Patient' },
    },
  });

  assert.equal((await findPatientByNic(oldNic))?.id, patient.id);
  assert.equal((await findPatientByNic(` ${oldNic.replace(/V$/, 'v')} `))?.id, patient.id);
  assert.equal((await findPatientByNic(normalizeNic(oldNic)))?.id, patient.id);
});

test('searching with an invalid NIC throws INVALID_NIC instead of returning nobody', async () => {
  await assert.rejects(findPatientByNic('855420159V'), (err) => err.code === 'INVALID_NIC');
});
