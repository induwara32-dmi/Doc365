// Tests for checking a NIC against the patient's date of birth and sex.
// 1999 is a normal year, 2000 is a leap year.
import './guard.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNicAgainstPatient, NIC_DAY_RULES } from '../src/patients/nic.js';
import { AppError } from '../src/errors.js';

// A demo NIC (new form) for a birth year and day; women get +500
function nicFor(year, day, female) {
  const dayCode = String(day + (female ? 500 : 0)).padStart(3, '0');
  return `DEMO-NIC-${year}${dayCode}00011`;
}

const ruleA = NIC_DAY_RULES.find((r) => r.name === 'february-always-29');
const ruleB = NIC_DAY_RULES.find((r) => r.name === 'real-calendar');

test('rule A (February always 29) counts days as expected', () => {
  assert.equal(ruleA.dayOf(new Date('1999-02-28')), 59);
  assert.equal(ruleA.dayOf(new Date('1999-03-01')), 61); // 060 is the missing 29 Feb
  assert.equal(ruleA.dayOf(new Date('1999-12-31')), 366);
  assert.equal(ruleA.dayOf(new Date('2000-02-29')), 60);
  assert.equal(ruleA.dayOf(new Date('2000-03-01')), 61);
  assert.equal(ruleA.dayOf(new Date('2000-12-31')), 366);
});

test('rule B (real calendar) counts days as expected', () => {
  assert.equal(ruleB.dayOf(new Date('1999-02-28')), 59);
  assert.equal(ruleB.dayOf(new Date('1999-03-01')), 60);
  assert.equal(ruleB.dayOf(new Date('1999-12-31')), 365);
  assert.equal(ruleB.dayOf(new Date('2000-02-29')), 60);
  assert.equal(ruleB.dayOf(new Date('2000-03-01')), 61);
  assert.equal(ruleB.dayOf(new Date('2000-12-31')), 366);
});

// [date of birth, NIC day, which rule makes it match]
const accepted = [
  ['1999-02-28', 59, 'both'],
  ['1999-03-01', 60, 'rule B'], // normal year: real calendar
  ['1999-03-01', 61, 'rule A'], // normal year: February always 29
  ['1999-12-31', 365, 'rule B'],
  ['1999-12-31', 366, 'rule A'],
  ['2000-02-28', 59, 'both'],
  ['2000-02-29', 60, 'both'], // leap year: both rules agree
  ['2000-03-01', 61, 'both'],
  ['2000-12-31', 366, 'both'],
];

// [date of birth, NIC day]
const rejected = [
  ['1999-02-28', 58],
  // 29 Feb 1999 does not exist. Day 060 in 1999 can only mean 1 March (rule B),
  // so it must NOT match someone born on 28 February.
  ['1999-02-28', 60],
  ['1999-03-01', 59],
  ['1999-03-01', 62],
  ['1999-12-31', 364],
  ['2000-02-28', 60],
  ['2000-02-29', 59],
  ['2000-02-29', 61],
  ['2000-03-01', 60], // in 2000, day 060 is 29 February
  ['2000-03-01', 62],
  ['2000-12-31', 365],
];

for (const sex of ['male', 'female']) {
  const female = sex === 'female';

  test(`${sex}: day codes that fit the date of birth are accepted`, () => {
    for (const [dob, day, why] of accepted) {
      const result = checkNicAgainstPatient(nicFor(dob.slice(0, 4), day, female), {
        dateOfBirth: new Date(dob),
        sex,
      });
      assert.deepEqual(result.warnings, [], `${dob} day ${day} (${why})`);
    }
  });

  test(`${sex}: day codes that do not fit the date of birth are rejected`, () => {
    for (const [dob, day] of rejected) {
      assert.throws(
        () => checkNicAgainstPatient(nicFor(dob.slice(0, 4), day, female), { dateOfBirth: new Date(dob), sex }),
        (err) => err instanceof AppError && err.code === 'NIC_DOB_MISMATCH',
        `${dob} day ${day} should be rejected`,
      );
    }
  });
}

test('a year mismatch is rejected', () => {
  assert.throws(
    () => checkNicAgainstPatient(nicFor(2000, 59, false), { dateOfBirth: new Date('1999-02-28'), sex: 'male' }),
    (err) => err.code === 'NIC_DOB_MISMATCH' && /year 2000/.test(err.message),
  );
});

test('old-form NICs are normalized first, then checked', () => {
  // DEMO-NIC-99060 0159 V -> 1999, day 060 -> 1 March 1999 (rule B)
  const result = checkNicAgainstPatient('DEMO-NIC-990600159V', {
    dateOfBirth: new Date('1999-03-01'),
    sex: 'male',
  });
  assert.equal(result.nic, 'DEMO-NIC-199906000159');
});

test('a sex mismatch is NOT rejected: it returns a warning for staff', () => {
  const asFemale = checkNicAgainstPatient(nicFor(1999, 59, true), {
    dateOfBirth: new Date('1999-02-28'),
    sex: 'male',
  });
  assert.equal(asFemale.warnings.length, 1);
  assert.equal(asFemale.warnings[0].code, 'NIC_SEX_MISMATCH');
  assert.match(asFemale.warnings[0].message, /encodes female.*record says male.*confirm/);

  const asMale = checkNicAgainstPatient(nicFor(1999, 59, false), {
    dateOfBirth: new Date('1999-02-28'),
    sex: 'female',
  });
  assert.equal(asMale.warnings[0].code, 'NIC_SEX_MISMATCH');
});

test('the sex check is skipped for "other" and "unknown"', () => {
  for (const sex of ['other', 'unknown']) {
    for (const female of [true, false]) {
      const result = checkNicAgainstPatient(nicFor(1999, 59, female), {
        dateOfBirth: new Date('1999-02-28'),
        sex,
      });
      assert.deepEqual(result.warnings, [], `${sex}, NIC female=${female}`);
    }
  }
});

test('a day mismatch is rejected even when the sex also mismatches', () => {
  assert.throws(
    () => checkNicAgainstPatient(nicFor(1999, 70, true), { dateOfBirth: new Date('1999-02-28'), sex: 'male' }),
    (err) => err.code === 'NIC_DOB_MISMATCH',
  );
});
