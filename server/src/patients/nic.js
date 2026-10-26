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
