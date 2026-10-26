// Checks a request body with a zod schema. On failure: AppError VALIDATION_ERROR
// with which fields are wrong, but never the values that were sent (they might
// be a password).
import { AppError } from '../errors.js';

export function parseBody(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const fields = result.error.issues.map((issue) => ({ field: issue.path.join('.'), problem: issue.code }));
  throw new AppError('VALIDATION_ERROR', 'Some fields are missing or invalid', { fields });
}
