// Password hashing with bcrypt (CLAUDE.md rule 6: never store passwords as text).
// Hashes and passwords are never logged and never returned by the API.
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { AppError } from '../errors.js';

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 10;
// bcrypt silently ignores everything after byte 72, so longer passwords are refused
const MAX_PASSWORD_BYTES = 72;

// A hash of a random password nobody knows. When a username does not exist we
// still compare against this, so the response takes as long as for a real user
// and an attacker cannot tell real usernames from the timing.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), BCRYPT_COST);

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError('WEAK_PASSWORD', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new AppError('WEAK_PASSWORD', `Password must be at most ${MAX_PASSWORD_BYTES} bytes`);
  }
  return bcrypt.hash(password, BCRYPT_COST);
}

// true if the password matches the hash. Pass hash = null for an unknown user:
// it then compares against the dummy hash and always returns false.
export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    await bcrypt.compare('x', DUMMY_HASH); // same timing
    return false;
  }
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash ? matches : false;
}
