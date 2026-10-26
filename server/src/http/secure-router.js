// The ONLY way to add API routes: every route names a permission, and the one
// middleware below checks it against the permission matrix (src/auth/permissions.js).
// DEFAULT DENY: a route with no permission, or a permission with no rule, is refused.
import express from 'express';
import { AppError } from '../errors.js';
import { PERMISSIONS, PUBLIC, ruleFor } from '../auth/permissions.js';
import { verifySessionToken } from '../auth/tokens.js';
import { loadSession } from '../auth/session.js';
import { writeAudit } from '../audit/audit-log.js';

// Reads "Authorization: Bearer <token>" and reloads the session from the database
async function authenticate(req) {
  const match = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '');
  if (!match) throw new AppError('UNAUTHENTICATED', 'Please log in (missing Bearer token)');
  return loadSession(verifySessionToken(match[1]));
}

// The one permission middleware
export function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const rules = permission ? PERMISSIONS[permission] : undefined;
      if (!rules) {
        console.warn(`Refused ${req.method} ${req.path}: no permission rule for "${permission}"`);
        throw new AppError('NO_PERMISSION_RULE', 'Access denied');
      }
      if (rules === PUBLIC) return next();

      req.actor = await authenticate(req);
      if (!ruleFor(req.actor, permission)) {
        await writeAudit(req.actor, {
          action: 'access.denied',
          details: { permission, method: req.method, path: req.originalUrl },
        });
        throw new AppError('FORBIDDEN', 'You do not have permission to do this');
      }
      req.permission = permission;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// api.get(path, permission, handler) / api.post(...). Handlers may be async:
// Express 5 passes their errors to the error handler.
export function secureRouter() {
  const router = express.Router();
  const add = (method) => (path, permission, handler) => {
    router[method](path, requirePermission(permission), handler);
  };
  return { router, get: add('get'), post: add('post') };
}
