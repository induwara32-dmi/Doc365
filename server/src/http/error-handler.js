// Turns errors into JSON responses: { error: { code, message, details? } }.
// Unexpected errors are logged with their name and code ONLY: a raw database
// error message can contain the data that was sent (e.g. a password hash).
import { AppError } from '../errors.js';

const STATUS = {
  INVALID_REQUEST: 400,
  INVALID_JSON: 400,
  VALIDATION_ERROR: 400,
  WEAK_PASSWORD: 400,
  INVALID_CHOICE: 400,
  INVALID_LOGIN: 401,
  UNAUTHENTICATED: 401,
  INVALID_TOKEN: 401,
  TOKEN_EXPIRED: 401,
  ACCOUNT_BLOCKED: 401,
  MEMBERSHIP_INACTIVE: 401,
  INVALID_PIN: 401,
  FORBIDDEN: 403,
  NO_PERMISSION_RULE: 403,
  NO_ACCESS: 403,
  NO_ACTIVE_GRANT: 403,
  BLOCKED_BY_PATIENT: 403,
  PATIENT_OPTED_OUT: 403,
  GUARDIAN_ACCESS_ENDED: 403,
  NOT_FOUND: 404,
  PATIENT_NOT_FOUND: 404,
  GUARDIAN_NOT_FOUND: 404,
  FACILITY_NOT_FOUND: 404,
  RECORD_NOT_FOUND: 404,
  CHOOSE_MEMBERSHIP: 409,
  CARD_NOT_ACTIVE: 409,
  CARD_CHANGED_CONCURRENTLY: 409,
  NIC_ALREADY_LINKED: 409,
  NIC_ALREADY_SET: 409,
  USERNAME_TAKEN: 409,
  SLMC_ALREADY_REGISTERED: 409,
  FACILITY_EXISTS: 409,
  DUPLICATE_RECORD: 409,
  RECORD_ALREADY_AMENDED: 409,
  PRESCRIPTION_ALREADY_DISPENSED: 409,
  SAFETY_WARNING: 422,
  FACILITY_MISMATCH: 403,
  TAMPERED_RECORD: 400,
  UNKNOWN_SIGNER: 400,
  INVALID_SIGNATURE: 400,
  SIGNATURE_REQUIRED: 400,
  INVALID_BUNDLE: 400,
  INVALID_STATUS: 400,
  INVALID_CARD: 400,
  INVALID_PIN_FORMAT: 400,
  INVALID_BREAK_GLASS_REASON: 400,
  INVALID_BLOCK_TARGET: 400,
};

// Other AppErrors (e.g. INVALID_NIC, NIC_DOB_MISMATCH) are the client's fault: 400
export function httpStatusFor(code) {
  return STATUS[code] ?? 400;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    const body = { code: err.code, message: err.message };
    if (err.details !== undefined) body.details = err.details;
    return res.status(httpStatusFor(err.code)).json({ error: body });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON' } });
  }
  console.error(`Unexpected error on ${req.method} ${req.path}: ${err.name}${err.code ? ` ${err.code}` : ''}`);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such route' } });
}
