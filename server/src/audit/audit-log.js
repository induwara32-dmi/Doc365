// Writing to the AuditLog (DESIGN.md sections 5 and 6): who did what, when and why.
// There is deliberately no update or delete function here, and the database refuses
// UPDATE, DELETE and TRUNCATE anyway (trigger "AuditLog_append_only").
import { prisma } from '../db.js';

// The "actor" is whoever is acting:
// - a logged-in session (built in src/auth/session.js), or
// - a script, via systemActor('seed').
// `label` is the readable snapshot stored on every row, e.g. "Demo Lab Colombo, MLT A. Silva".
export function systemActor(name) {
  return { userId: null, membershipId: null, facilityId: null, label: `system (${name})` };
}

// Call this BEFORE changing anything, so a change without an actor never starts.
export function requireActor(actor) {
  if (!actor || typeof actor.label !== 'string' || !actor.label) {
    throw new Error('An actor is required: every change to patient data is audited');
  }
}

// Write one audit row. Pass `db` (a transaction client) so the row is saved in the
// same transaction as the change it describes: both are saved, or neither.
// Never put secrets, passwords or text typed into a login form into `details`.
export async function writeAudit(actor, { action, patientId, targetType, targetId, reason, details }, db = prisma) {
  requireActor(actor);
  return db.auditLog.create({
    data: {
      userId: actor.userId ?? null,
      membershipId: actor.membershipId ?? null,
      facilityId: actor.facilityId ?? null,
      actorLabel: actor.label,
      action,
      patientId: patientId ?? null,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      reason: reason ?? null,
      details: details ?? undefined,
    },
  });
}
