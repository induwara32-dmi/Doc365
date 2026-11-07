// Phase 5: Access Engine, "Three Keys" Rule, Emergency Break-Glass, and Consent Controls.
// Full clinical record access requires:
// 1. Patient's physical/digital health card (scanned -> creates a 90-day AccessGrant)
// 2. Authenticated doctor or clinical staff (DOCTOR, HOSPITAL_STAFF)
// 3. Registered facility membership
// Patient controls: PIN for sensitive records, document hiding, provider blocking, opt-out, access ledger.

import bcrypt from 'bcrypt';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { requireActor, writeAudit } from '../audit/audit-log.js';
import { guardianAccessActive, todayInSriLanka } from '../patients/age.js';
import { PATIENT } from '../auth/permissions.js';

const BCRYPT_COST = 12;
const DEFAULT_GRANT_DAYS = 90;

export function getGrantDurationDays() {
  const envDays = parseInt(process.env.ACCESS_GRANT_DAYS || '', 10);
  return Number.isFinite(envDays) && envDays > 0 ? envDays : DEFAULT_GRANT_DAYS;
}

// ---------- 1. Three Keys Card Scan & Access Grants ----------

// Scans an active health card and creates a scoped 90-day AccessGrant for the facility
export async function scanCardAndCreateGrant({ healthId, cardSerial }, { actor, db = prisma }) {
  requireActor(actor);

  if (!actor.facilityId || (actor.role !== 'DOCTOR' && actor.role !== 'HOSPITAL_STAFF')) {
    throw new AppError('FORBIDDEN', 'Only clinical staff at a registered facility may scan patient cards');
  }

  const patient = await db.patient.findUnique({
    where: { healthId },
    include: { cards: true },
  });
  if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'No patient with this Health ID');

  if (patient.optedOutAt) {
    throw new AppError('PATIENT_OPTED_OUT', 'Patient has opted out of centralized health records');
  }

  const card = patient.cards.find((c) => c.serial === cardSerial);
  if (!card) {
    throw new AppError('INVALID_CARD', 'Card not found for this patient');
  }
  if (card.status !== 'ACTIVE') {
    throw new AppError('CARD_NOT_ACTIVE', 'Card is not active');
  }

  // Check if facility or doctor is blocked by the patient
  const block = await db.patientProviderBlock.findFirst({
    where: {
      patientId: patient.id,
      active: true,
      OR: [
        { facilityId: actor.facilityId },
        { doctorUserId: actor.userId },
      ],
    },
  });
  if (block) {
    throw new AppError('BLOCKED_BY_PATIENT', 'Patient has blocked this healthcare facility or doctor');
  }

  const days = getGrantDurationDays();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const grant = await db.accessGrant.create({
    data: {
      patientId: patient.id,
      facilityId: actor.facilityId,
      cardId: card.id,
      grantedByUserId: actor.userId,
      expiresAt,
      isBreakGlass: false,
    },
  });

  await writeAudit(actor, {
    action: 'access.grant_created',
    patientId: patient.id,
    targetType: 'AccessGrant',
    targetId: grant.id,
    details: {
      facilityId: actor.facilityId,
      cardSerial: card.serial,
      expiresAt,
      grantDurationDays: days,
    },
  }, db);

  return { grant, expiresAt };
}

// Verifies that the actor has active clinical access (Three Keys) to the patient
export async function verifyClinicalAccess(patientId, { actor, db = prisma, today = todayInSriLanka() }) {
  requireActor(actor);

  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'Patient not found');

  // Patient access (themselves or valid guardian)
  if (actor.role === PATIENT) {
    if (actor.ownPatientId === patientId) {
      return { allowed: true, isPatient: true };
    }

    // Check guardian access (< 16 years)
    const link = await db.guardianLink.findFirst({
      where: { childId: patientId, guardianId: actor.ownPatientId },
      include: { child: true },
    });
    if (link) {
      if (guardianAccessActive(link.child.dateOfBirth, today)) {
        return { allowed: true, isGuardian: true };
      }
      throw new AppError('GUARDIAN_ACCESS_ENDED', 'Guardian access ends at age 16');
    }

    throw new AppError('FORBIDDEN', 'You do not have access to this patient’s records');
  }

  // Clinical staff access
  if (actor.role !== 'DOCTOR' && actor.role !== 'HOSPITAL_STAFF') {
    throw new AppError('FORBIDDEN', 'You do not have permission to view clinical records');
  }

  if (patient.optedOutAt) {
    throw new AppError('PATIENT_OPTED_OUT', 'Patient has opted out of centralized health records');
  }

  // Check provider block
  const block = await db.patientProviderBlock.findFirst({
    where: {
      patientId: patient.id,
      active: true,
      OR: [
        { facilityId: actor.facilityId },
        { doctorUserId: actor.userId },
      ],
    },
  });
  if (block) {
    throw new AppError('BLOCKED_BY_PATIENT', 'Patient has blocked this healthcare facility or doctor');
  }

  // Find active AccessGrant for this facility
  const activeGrant = await db.accessGrant.findFirst({
    where: {
      patientId: patient.id,
      facilityId: actor.facilityId,
      expiresAt: { gt: new Date() },
      revokedAt: null,
    },
    orderBy: { expiresAt: 'desc' },
  });

  if (!activeGrant) {
    throw new AppError('NO_ACTIVE_GRANT', 'No active access grant for this facility. Patient health card scan required.');
  }

  return { allowed: true, grant: activeGrant, isBreakGlass: activeGrant.isBreakGlass };
}

// Revokes an active AccessGrant
export async function revokeAccessGrant(grantId, { reason, actor, db = prisma }) {
  requireActor(actor);

  const grant = await db.accessGrant.findUnique({ where: { id: grantId } });
  if (!grant) throw new AppError('NOT_FOUND', 'Access grant not found');

  const updated = await db.accessGrant.update({
    where: { id: grantId },
    data: {
      revokedAt: new Date(),
      revokedByUserId: actor.userId,
    },
  });

  await writeAudit(actor, {
    action: 'access.grant_revoked',
    patientId: grant.patientId,
    targetType: 'AccessGrant',
    targetId: grant.id,
    reason,
  }, db);

  return updated;
}

// ---------- 2. Patient PIN & Sensitive Records ----------

export async function setPatientPin(patientId, pin, { actor, db = prisma, today = todayInSriLanka() }) {
  requireActor(actor);

  if (!/^\d{4,6}$/.test(pin)) {
    throw new AppError('INVALID_PIN_FORMAT', 'Patient PIN must be 4 to 6 digits');
  }

  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'Patient not found');

  // Allowed by patient themselves, guardian (<16), or REGISTRAR
  if (actor.role === PATIENT) {
    if (actor.ownPatientId !== patientId) {
      const link = await db.guardianLink.findFirst({
        where: { childId: patientId, guardianId: actor.ownPatientId },
        include: { child: true },
      });
      if (!link || !guardianAccessActive(link.child.dateOfBirth, today)) {
        throw new AppError('FORBIDDEN', 'Only the patient or active guardian may set the PIN');
      }
    }
  } else if (actor.role !== 'REGISTRAR') {
    throw new AppError('FORBIDDEN', 'Only the patient or a registration officer may set the patient PIN');
  }

  const pinHash = await bcrypt.hash(pin, BCRYPT_COST);

  await db.patient.update({
    where: { id: patientId },
    data: { pinHash },
  });

  await writeAudit(actor, {
    action: 'patient.pin_set',
    patientId: patient.id,
    details: { pinLength: pin.length },
  }, db);

  return { success: true };
}

export async function verifyPatientPin(patient, pin) {
  if (!patient.pinHash || !pin) return false;
  return bcrypt.compare(pin, patient.pinHash);
}

// ---------- 3. Emergency Summary & Break-Glass ----------

// Emergency summary (cardless, returns basic life-saving facts only)
export async function getEmergencySummary(healthId, { actor, db = prisma }) {
  requireActor(actor);

  if (actor.role !== 'DOCTOR' && actor.role !== 'HOSPITAL_STAFF') {
    throw new AppError('FORBIDDEN', 'Only clinical staff may view emergency summaries');
  }

  const patient = await db.patient.findUnique({ where: { healthId } });
  if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'No patient with this Health ID');

  // Emergency summary is minimal subset: allergies, conditions, medications, blood group
  const fhirPatient = patient.fhir;
  const emergencySummary = {
    allergies: [],
    chronicConditions: [],
    currentMedications: [],
    bloodGroup: fhirPatient.extension?.find((e) => e.url?.includes('blood-group'))?.valueString ?? 'Unknown',
  };

  await writeAudit(actor, {
    action: 'access.emergency_summary',
    patientId: patient.id,
    targetType: 'Patient',
    targetId: patient.healthId,
    details: { view: 'emergency_summary' },
  }, db);

  return {
    patient: {
      healthId: patient.healthId,
      name: patient.fullName ?? [patient.givenName, patient.familyName].filter(Boolean).join(' '),
      sex: patient.sex,
      dateOfBirth: patient.dateOfBirth.toISOString().slice(0, 10),
    },
    emergencySummary,
  };
}

// Emergency Break-Glass (unconsented access when card is unavailable)
export async function breakGlassAccess(healthId, { reason }, { actor, db = prisma }) {
  requireActor(actor);

  if (!actor.facilityId || (actor.role !== 'DOCTOR' && actor.role !== 'HOSPITAL_STAFF')) {
    throw new AppError('FORBIDDEN', 'Only doctors or hospital staff may perform break-glass access');
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
    throw new AppError('INVALID_BREAK_GLASS_REASON', 'A medical justification of at least 10 characters is required for break-glass emergency access');
  }

  const patient = await db.patient.findUnique({ where: { healthId } });
  if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'No patient with this Health ID');

  // Emergency window: 24 hours
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const grant = await db.accessGrant.create({
    data: {
      patientId: patient.id,
      facilityId: actor.facilityId,
      cardId: null,
      grantedByUserId: actor.userId,
      expiresAt,
      isBreakGlass: true,
      breakGlassReason: reason.trim(),
    },
  });

  await writeAudit(actor, {
    action: 'access.break_glass',
    patientId: patient.id,
    targetType: 'Patient',
    targetId: patient.healthId,
    reason: reason.trim(),
    details: {
      overrideCode: 'EMERGENCY_OVERRIDE_ACCESSED',
      facilityId: actor.facilityId,
      expiresAt,
      accessGrantId: grant.id,
    },
  }, db);

  return {
    grant,
    warning: 'EMERGENCY_OVERRIDE_ACCESSED: Break-glass override logged and flagged for audit review',
    expiresAt,
  };
}

// ---------- 4. Patient Controls (Block, Hide, Opt-Out) ----------

// Block a hospital facility or specific doctor
export async function blockProvider(patientId, { facilityId, doctorUserId, reason }, { actor, db = prisma, today = todayInSriLanka() }) {
  requireActor(actor);

  if (!facilityId && !doctorUserId) {
    throw new AppError('INVALID_BLOCK_TARGET', 'You must specify a facility or a doctor to block');
  }

  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'Patient not found');

  // Validate patient or active guardian
  if (actor.role === PATIENT) {
    if (actor.ownPatientId !== patientId) {
      const link = await db.guardianLink.findFirst({
        where: { childId: patientId, guardianId: actor.ownPatientId },
        include: { child: true },
      });
      if (!link || !guardianAccessActive(link.child.dateOfBirth, today)) {
        throw new AppError('FORBIDDEN', 'Only the patient or active guardian may block providers');
      }
    }
  } else {
    throw new AppError('FORBIDDEN', 'Only the patient or their guardian may block providers');
  }

  const block = await db.patientProviderBlock.create({
    data: {
      patientId,
      facilityId: facilityId ?? null,
      doctorUserId: doctorUserId ?? null,
      reason: reason ?? null,
      active: true,
    },
  });

  // Invalidate any active AccessGrants for this facility
  if (facilityId) {
    await db.accessGrant.updateMany({
      where: {
        patientId,
        facilityId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedByUserId: actor.userId,
      },
    });
  }

  await writeAudit(actor, {
    action: 'provider.block',
    patientId,
    targetType: 'PatientProviderBlock',
    targetId: block.id,
    details: { facilityId, doctorUserId },
  }, db);

  return block;
}

// Unblock a previously blocked provider
export async function unblockProvider(blockId, { actor, db = prisma }) {
  requireActor(actor);

  const block = await db.patientProviderBlock.findUnique({ where: { id: blockId } });
  if (!block) throw new AppError('NOT_FOUND', 'Block rule not found');

  const updated = await db.patientProviderBlock.update({
    where: { id: blockId },
    data: { active: false },
  });

  await writeAudit(actor, {
    action: 'provider.unblock',
    patientId: block.patientId,
    targetType: 'PatientProviderBlock',
    targetId: block.id,
  }, db);

  return updated;
}

// Hide a document / clinical record lineage from doctor view
export async function hideRecord(patientId, lineageId, { reason, actor, db = prisma, today = todayInSriLanka() }) {
  requireActor(actor);

  if (actor.role === PATIENT) {
    if (actor.ownPatientId !== patientId) {
      const link = await db.guardianLink.findFirst({
        where: { childId: patientId, guardianId: actor.ownPatientId },
        include: { child: true },
      });
      if (!link || !guardianAccessActive(link.child.dateOfBirth, today)) {
        throw new AppError('FORBIDDEN', 'Only the patient or active guardian may hide records');
      }
    }
  } else {
    throw new AppError('FORBIDDEN', 'Only the patient or guardian may hide documents');
  }

  const hidden = await db.hiddenRecord.upsert({
    where: { patientId_lineageId: { patientId, lineageId } },
    create: {
      patientId,
      lineageId,
      hiddenByUserId: actor.userId,
      reason: reason ?? null,
      active: true,
    },
    update: {
      active: true,
      hiddenByUserId: actor.userId,
      reason: reason ?? null,
      hiddenAt: new Date(),
    },
  });

  await writeAudit(actor, {
    action: 'record.hide',
    patientId,
    targetType: 'HiddenRecord',
    targetId: hidden.id,
    details: { lineageId },
  }, db);

  return hidden;
}

// Unhide a previously hidden document
export async function unhideRecord(patientId, lineageId, { actor, db = prisma }) {
  requireActor(actor);

  const hidden = await db.hiddenRecord.findUnique({
    where: { patientId_lineageId: { patientId, lineageId } },
  });
  if (!hidden) throw new AppError('NOT_FOUND', 'Hidden record entry not found');

  const updated = await db.hiddenRecord.update({
    where: { id: hidden.id },
    data: { active: false },
  });

  await writeAudit(actor, {
    action: 'record.unhide',
    patientId,
    targetType: 'HiddenRecord',
    targetId: hidden.id,
    details: { lineageId },
  }, db);

  return updated;
}

// Patient opt-out of centralized records
export async function optOutPatient(patientId, { reason, actor, db = prisma, today = todayInSriLanka() }) {
  requireActor(actor);

  if (actor.role === PATIENT && actor.ownPatientId !== patientId) {
    const link = await db.guardianLink.findFirst({
      where: { childId: patientId, guardianId: actor.ownPatientId },
      include: { child: true },
    });
    if (!link || !guardianAccessActive(link.child.dateOfBirth, today)) {
      throw new AppError('FORBIDDEN', 'Only the patient or active guardian may opt out');
    }
  }

  const patient = await db.patient.update({
    where: { id: patientId },
    data: {
      optedOutAt: new Date(),
      optOutReason: reason ?? null,
    },
  });

  // Invalidate all active access grants immediately
  await db.accessGrant.updateMany({
    where: { patientId, revokedAt: null },
    data: { revokedAt: new Date(), revokedByUserId: actor.userId },
  });

  await writeAudit(actor, {
    action: 'patient.opt_out',
    patientId,
    reason,
  }, db);

  return patient;
}

// Opt back in
export async function optInPatient(patientId, { actor, db = prisma }) {
  requireActor(actor);

  const patient = await db.patient.update({
    where: { id: patientId },
    data: {
      optedOutAt: null,
      optOutReason: null,
    },
  });

  await writeAudit(actor, {
    action: 'patient.opt_in',
    patientId,
  }, db);

  return patient;
}

// ---------- 5. "Who Viewed My Record" Access Ledger ----------

export async function getAccessLedger(patientId, { actor, db = prisma, today = todayInSriLanka() }) {
  requireActor(actor);

  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'Patient not found');

  if (actor.role === PATIENT) {
    if (actor.ownPatientId !== patientId) {
      const link = await db.guardianLink.findFirst({
        where: { childId: patientId, guardianId: actor.ownPatientId },
        include: { child: true },
      });
      if (!link || !guardianAccessActive(link.child.dateOfBirth, today)) {
        throw new AppError('FORBIDDEN', 'Only the patient or active guardian may view the access ledger');
      }
    }
  } else if (actor.role !== 'ADMIN') {
    throw new AppError('FORBIDDEN', 'Only the patient or system admin may view the access ledger');
  }

  const events = await db.auditLog.findMany({
    where: {
      patientId,
      action: {
        in: [
          'patient.view',
          'record.view',
          'record.view_history',
          'access.grant_created',
          'access.break_glass',
          'access.emergency_summary',
        ],
      },
    },
    orderBy: { at: 'desc' },
  });

  const timeline = events.map((e) => ({
    id: e.id,
    at: e.at,
    actorLabel: e.actorLabel,
    action: e.action,
    facilityId: e.facilityId,
    reason: e.reason,
    isBreakGlass: e.action === 'access.break_glass',
  }));

  await writeAudit(actor, {
    action: 'access.ledger_viewed',
    patientId,
    details: { eventCount: timeline.length },
  }, db);

  return { patientId, entries: timeline };
}
