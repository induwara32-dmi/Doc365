// NIC numbers (DESIGN.md section 1). Demo NICs always start with DEMO-NIC-,
// so a real NIC can never be saved by accident. After the prefix, the real
// Sri Lankan rules apply:
//   old: 9 digits + V or X        e.g. DEMO-NIC-855420159V
//   new: 12 digits                e.g. DEMO-NIC-198554200159
// Old NICs are converted to the new form with the official DRP rule
// (drp.gov.lk FAQ): drop the V/X, add "0" before the last 4 digits,
// and start with "19". Old NICs were only issued to people born in the 1900s.
// The same function is used for saving AND for searching, so a lookup by an
// old NIC finds a patient saved with the new one.
import { AppError } from '../errors.js';

const PREFIX = 'DEMO-NIC-';
const OLD_NIC = /^\d{9}[VX]$/i;
const NEW_NIC = /^\d{12}$/;

function invalid(message) {
  return new AppError('INVALID_NIC', message);
}

// Returns the NIC in the new 12-digit form (with the DEMO-NIC- prefix),
// or throws AppError INVALID_NIC. Never returns an invalid NIC unchanged.
export function normalizeNic(input) {
  if (typeof input !== 'string') throw invalid('NIC must be text');

  const value = input.trim();
  if (!value.startsWith(PREFIX)) {
    throw invalid(`Demo NICs must start with ${PREFIX} (real NIC numbers are never used)`);
  }

  const number = value.slice(PREFIX.length);
  let newNic;
  if (OLD_NIC.test(number)) {
    // 85542 0159 V  ->  19 85542 0 0159
    newNic = `19${number.slice(0, 5)}0${number.slice(5, 9)}`;
  } else if (NEW_NIC.test(number)) {
    newNic = number;
  } else {
    throw invalid('NIC must be 9 digits + V/X (old) or 12 digits (new), after DEMO-NIC-');
  }

  // Digits 5-7 are the day of the year of birth. Women have 500 added.
  const day = Number(newNic.slice(4, 7));
  const validDay = (day >= 1 && day <= 366) || (day >= 501 && day <= 866);
  if (!validDay) {
    throw invalid(`NIC day-of-year ${newNic.slice(4, 7)} is not valid (001-366 or 501-866)`);
  }

  return PREFIX + newNic;
}

// ---------- Cross-check a NIC against the patient's record ----------
// Used when linking a NIC at 16 (DESIGN.md section 1).

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Normal day of the year: 1 January = 1, 31 December = 365 (366 in a leap year).
function calendarDayOfYear(date) {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.round((date.getTime() - startOfYear) / 86_400_000) + 1;
}

// How a NIC day code may count days. No official source says which one the DRP
// uses, so a NIC is accepted if ANY rule matches (DESIGN.md section 1).
// To drop a rule later, delete its line here and its test.
export const NIC_DAY_RULES = [
  {
    // Rule A: February always has 29 days, even in normal years
    // (most unofficial sources). In a normal year, 1 March = 61, 31 December = 366.
    name: 'february-always-29',
    dayOf(date) {
      const day = calendarDayOfYear(date);
      const afterFebruary = date.getUTCMonth() >= 2; // March or later
      return !isLeapYear(date.getUTCFullYear()) && afterFebruary ? day + 1 : day;
    },
  },
  {
    // Rule B: the real calendar. In a normal year, 1 March = 60, 31 December = 365.
    name: 'real-calendar',
    dayOf: calendarDayOfYear,
  },
];

// Checks that a NIC fits the patient's date of birth and sex.
// - Year or day-of-year mismatch: throws AppError NIC_DOB_MISMATCH.
// - Sex mismatch (the +500 part): NOT rejected; returns a warning for staff
//   to confirm. Skipped when sex is "other" or "unknown".
// Returns { nic, warnings }, where nic is the normalized NIC to save.
export function checkNicAgainstPatient(nic, { dateOfBirth, sex }) {
  const normalized = normalizeNic(nic);
  const digits = normalized.slice(PREFIX.length);

  const nicYear = Number(digits.slice(0, 4));
  const dayCode = Number(digits.slice(4, 7));
  const nicSaysFemale = dayCode > 500;
  const nicDay = nicSaysFemale ? dayCode - 500 : dayCode;

  const birthYear = dateOfBirth.getUTCFullYear();
  if (nicYear !== birthYear) {
    throw new AppError(
      'NIC_DOB_MISMATCH',
      `NIC year ${nicYear} does not match the date of birth (${birthYear})`,
    );
  }

  const dayMatches = NIC_DAY_RULES.some((rule) => rule.dayOf(dateOfBirth) === nicDay);
  if (!dayMatches) {
    throw new AppError(
      'NIC_DOB_MISMATCH',
      `NIC day-of-year ${String(nicDay).padStart(3, '0')} does not match the date of birth ` +
        `(${dateOfBirth.toISOString().slice(0, 10)})`,
    );
  }

  const warnings = [];
  const sexMismatch = (sex === 'male' && nicSaysFemale) || (sex === 'female' && !nicSaysFemale);
  if (sexMismatch) {
    warnings.push({
      code: 'NIC_SEX_MISMATCH',
      message: `The NIC encodes ${nicSaysFemale ? 'female' : 'male'}, but the record says ${sex}. ` +
        'Please confirm with the patient before saving.',
    });
  }

  return { nic: normalized, warnings };
}
