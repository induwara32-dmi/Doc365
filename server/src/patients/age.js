// Age is never stored (DESIGN.md section 1): it is always calculated from the
// date of birth. Dates are handled as "date only" values: a Date at UTC midnight,
// the same form Prisma returns for a @db.Date column.

export const NIC_MIN_AGE = 16; // NIC is linked at 16
export const GUARDIAN_ACCESS_ENDS_AT = 16; // guardian sees the child's record until 16
export const GUARDIAN_MIN_AGE = 18; // a guardian must be an adult

// Today's date in Sri Lanka (Asia/Colombo, UTC+5:30), as a date-only value.
// Using the UTC date instead would be one day behind between 00:00 and 05:30.
export function todayInSriLanka(now = new Date()) {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }); // YYYY-MM-DD
  return new Date(ymd);
}

// Full years between dateOfBirth and today.
// Someone born on 29 February has their birthday on 1 March in normal years.
export function ageOn(dateOfBirth, today) {
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const sameMonth = today.getUTCMonth() === dateOfBirth.getUTCMonth();
  const beforeBirthday =
    today.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (sameMonth && today.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// Guardian access ends at 16. The GuardianLink row is never deleted;
// this is calculated every time (DESIGN.md section 1).
export function guardianAccessActive(childDateOfBirth, today) {
  return ageOn(childDateOfBirth, today) < GUARDIAN_ACCESS_ENDS_AT;
}

// 'YYYY-MM-DD' -> date-only value. Returns null for a wrong format or an
// impossible date (e.g. 1999-02-29).
export function parseDate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(text);
  // JavaScript may roll an impossible date over (29 Feb -> 1 Mar) or reject it;
  // either way it will not print back as the same text.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return null;
  return date;
}
