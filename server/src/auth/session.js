// Turns a session (user id + chosen membership id) into the "actor" that every
// permission check and audit row uses. Reloaded from the database on EVERY request,
// so a blocked account or an ended membership stops working at once.
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { PATIENT } from './permissions.js';

// "LAB_STAFF" -> "lab staff" (used when a membership has no job title)
function roleName(role) {
  return role.toLowerCase().replace('_', ' ');
}

// The audit label comes from the membership: "Demo Lab Colombo, MLT A. Silva"
export function actorForMembership(user, membership) {
  const title = membership.jobTitle ?? roleName(membership.role);
  return {
    userId: user.id,
    membershipId: membership.id,
    facilityId: membership.facilityId,
    facilityType: membership.facility.type,
    role: membership.role,
    label: `${membership.facility.name}, ${title} ${user.fullName}`,
  };
}

// Logged in as themselves: their own record, plus guardian access to their
// children (calculated from GuardianLink and the child's age, Phase 5)
export function actorForPatient(user) {
  return {
    userId: user.id,
    membershipId: null,
    facilityId: null,
    role: PATIENT,
    ownPatientId: user.patientId,
    label: `Patient ${user.fullName}`,
  };
}

const invalidToken = () => new AppError('INVALID_TOKEN', 'Invalid session token');

export async function loadSession({ userId, membershipId }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, status: true, patientId: true },
  });
  if (!user) throw invalidToken();
  if (user.status !== 'ACTIVE') throw new AppError('ACCOUNT_BLOCKED', 'This account is blocked');

  if (membershipId) {
    const membership = await prisma.staffMembership.findUnique({
      where: { id: membershipId },
      include: { facility: true },
    });
    if (!membership || membership.userId !== user.id) throw invalidToken();
    if (membership.status !== 'ACTIVE') {
      throw new AppError('MEMBERSHIP_INACTIVE', 'This role at this facility is no longer active');
    }
    return actorForMembership(user, membership);
  }

  if (!user.patientId) throw invalidToken();
  return actorForPatient(user);
}

// What the API may show about the current session. No hashes, no secrets.
export function publicSession(actor) {
  return { userId: actor.userId, membershipId: actor.membershipId, role: actor.role, label: actor.label };
}
