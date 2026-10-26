// Facilities, user accounts and staff memberships (DESIGN.md section 5).
// Created rarely, by an ADMIN (or the seed script), through these functions only.
// Every change is audited. Passwords are hashed here and never returned.
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { requireActor, writeAudit } from '../audit/audit-log.js';
import { hashPassword } from './passwords.js';
import { ALLOWED_FACILITY_TYPES } from './permissions.js';

// The user fields that may leave this module. passwordHash is never selected.
export const SAFE_USER_FIELDS = { id: true, username: true, status: true, fullName: true, patientId: true, createdAt: true };

export function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

export async function createFacility({ code, name, type, publicKeyPem }, { actor }) {
  requireActor(actor);
  return prisma.$transaction(async (tx) => {
    const facility = await tx.facility.create({ data: { code, name, type, publicKeyPem: publicKeyPem ?? null } });
    await writeAudit(actor, { action: 'facility.create', targetType: 'Facility', targetId: facility.id, details: { code, type } }, tx);
    return facility;
  });
}

// Returns the user WITHOUT passwordHash
export async function createUser({ username, password, fullName, patientId }, { actor }) {
  requireActor(actor);
  const name = normalizeUsername(username);
  if (!/^[a-z0-9._-]{3,40}$/.test(name)) {
    throw new AppError('INVALID_REQUEST', 'Username: 3-40 characters, letters, digits, . _ -');
  }
  if (!fullName?.trim()) throw new AppError('INVALID_REQUEST', 'Full name is required');
  const passwordHash = await hashPassword(password);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { username: name, passwordHash, fullName: fullName.trim(), patientId: patientId ?? null },
        select: SAFE_USER_FIELDS,
      });
      await writeAudit(
        actor,
        { action: 'account.create_user', targetType: 'User', targetId: user.id, patientId: user.patientId },
        tx,
      );
      return user;
    });
  } catch (err) {
    if (err.code === 'P2002' && err.meta?.target?.includes('username')) {
      throw new AppError('USERNAME_TAKEN', 'This username is already taken');
    }
    if (err.code === 'P2002' && err.meta?.target?.includes('patientId')) {
      throw new AppError('PATIENT_ALREADY_HAS_ACCOUNT', 'This patient already has an account');
    }
    throw err;
  }
}

// A role at a facility. Only the role/facility-type pairs in permissions.js are allowed.
export async function createMembership({ userId, facilityId, role, jobTitle }, { actor }) {
  requireActor(actor);
  if (!ALLOWED_FACILITY_TYPES[role]) throw new AppError('INVALID_REQUEST', `Unknown staff role ${role}`);

  return prisma.$transaction(async (tx) => {
    const facility = await tx.facility.findUnique({ where: { id: facilityId } });
    if (!facility) throw new AppError('FACILITY_NOT_FOUND', 'No such facility');
    if (!ALLOWED_FACILITY_TYPES[role].includes(facility.type)) {
      throw new AppError(
        'ROLE_NOT_ALLOWED_AT_FACILITY',
        `${role} is not allowed at a ${facility.type} (allowed: ${ALLOWED_FACILITY_TYPES[role].join(', ')})`,
      );
    }
    const membership = await tx.staffMembership.create({
      data: { userId, facilityId, role, jobTitle: jobTitle?.trim() || null },
    });
    await writeAudit(
      actor,
      { action: 'account.create_membership', targetType: 'StaffMembership', targetId: membership.id, details: { userId, role } },
      tx,
    );
    return membership;
  });
}
