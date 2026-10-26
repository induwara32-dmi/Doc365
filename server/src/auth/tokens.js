// Session tokens (JWT). A token holds ONLY the user id ("sub") and the chosen
// membership id ("mid", null when logged in as a patient). No names, no roles:
// everything else is reloaded from the database on every request, so a blocked
// account or an ended membership stops working at once.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../errors.js';

const ALGORITHM = 'HS256';

export function signSessionToken({ userId, membershipId }) {
  return jwt.sign({ mid: membershipId ?? null }, config.jwtSecret, {
    algorithm: ALGORITHM,
    expiresIn: config.jwtExpiresIn, // 15 minutes
    subject: userId,
  });
}

// Returns { userId, membershipId } or throws AppError TOKEN_EXPIRED / INVALID_TOKEN.
export function verifySessionToken(token) {
  try {
    // Only HS256 is accepted: a token claiming "alg": "none" (or anything else) is refused
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: [ALGORITHM] });
    if (typeof payload.sub !== 'string') throw new Error('no subject');
    return { userId: payload.sub, membershipId: payload.mid ?? null };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('TOKEN_EXPIRED', 'Your session has expired. Please log in again.');
    }
    throw new AppError('INVALID_TOKEN', 'Invalid session token');
  }
}
