// Tests for age calculation and date parsing: pure, no database needed.
import './guard.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, guardianAccessActive, parseDate, todayInSriLanka } from '../src/patients/age.js';

const d = (text) => new Date(text);

test('age goes up on the birthday, not the day before', () => {
  assert.equal(ageOn(d('2010-05-14'), d('2026-05-13')), 15);
  assert.equal(ageOn(d('2010-05-14'), d('2026-05-14')), 16);
  assert.equal(ageOn(d('2010-05-14'), d('2026-12-31')), 16);
  assert.equal(ageOn(d('2026-10-01'), d('2026-10-26')), 0); // a newborn
});

test('born on 29 February: birthday is 1 March in normal years', () => {
  assert.equal(ageOn(d('2008-02-29'), d('2024-02-28')), 15);
  assert.equal(ageOn(d('2008-02-29'), d('2024-02-29')), 16); // leap year
  assert.equal(ageOn(d('2008-02-29'), d('2025-02-28')), 16);
  assert.equal(ageOn(d('2008-02-29'), d('2025-03-01')), 17); // normal year
});

test('guardian access ends on the 16th birthday', () => {
  assert.equal(guardianAccessActive(d('2010-05-14'), d('2026-05-13')), true);
  assert.equal(guardianAccessActive(d('2010-05-14'), d('2026-05-14')), false);
});

test('parseDate accepts real dates only', () => {
  assert.deepEqual(parseDate('2000-02-29'), d('2000-02-29'));
  for (const bad of ['1999-02-29', '2026-13-01', '2026-04-31', '26-10-2026', '2026-1-5', '', null, 20261026]) {
    assert.equal(parseDate(bad), null, `${JSON.stringify(bad)} should be rejected`);
  }
});

test("today in Sri Lanka is already tomorrow's UTC date after 18:30 UTC", () => {
  // 25 Oct 2026, 20:00 UTC = 26 Oct 2026, 01:30 in Colombo (UTC+5:30)
  assert.deepEqual(todayInSriLanka(new Date('2026-10-25T20:00:00Z')), d('2026-10-26'));
  assert.deepEqual(todayInSriLanka(new Date('2026-10-25T18:00:00Z')), d('2026-10-25'));
});
