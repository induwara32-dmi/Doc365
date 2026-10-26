// Login (CLAUDE.md: approved security decisions).
// - Wrong username and wrong password give the SAME error and take the same time.
// - Failed logins are audited WITHOUT the typed text: "unknown username", or the
//   matching user's id. People type passwords into the username field, and the
//   audit log can never be deleted.
// - A person with several memberships (or a patient record) chooses one.
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { writeAudit } from '../audit/audit-log.js';
import { verifyPassword } from './passwords.js';
import { signSessionToken } from './tokens.js';
import { actorForMembership, actorForPatient, publicSession } from './session.js';
import { normalizeUsername } from './account-service.js';

const UNKNOWN_USERNAME_ACTOR = { userId: null, membershipId: null, facilityId: null, label: 'unknown username' };

function invalidLogin() {
  return new AppError('INVALID_LOGIN', 'Invalid username or password');
}

// The choices a user can log in as (shown only after a correct password)
function loginOptions(user) {
  const options = user.memberships.map((m) => ({
    membershipId: m.id,
    facility: m.facility.name,
    facilityType: m.facility.type,
    role: m.role,
    jobTitle: m.jobTitle,
  }));
  if (user.patientId) options.push({ asPatient: true, label: 'My own health record' });
  return options;
}

// Returns { token, expiresInSeconds, session } or throws AppError.
export async function login({ username, password, membershipId, asPatient }) {
  const user = await prisma.user.findUnique({
    where: { username: normalizeUsername(username) },
    include: {
      memberships: { where: { status: 'ACTIVE' }, include: { facility: true }, orderBy: { createdAt: 'asc' } },
    },
  });

  // Always run bcrypt, even for an unknown username (same timing)
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? null);

  if (!user) {
    await writeAudit(UNKNOWN_USERNAME_ACTOR, { action: 'auth.login_failed' });
    throw invalidLogin();
  }
  const userActor = { userId: user.id, membershipId: null, facilityId: null, label: 'failed login' };
  if (!passwordOk) {
    await writeAudit(userActor, { action: 'auth.login_failed' });
    throw invalidLogin();
  }
  if (user.status !== 'ACTIVE') {
    await writeAudit({ ...userActor, label: 'refused login' }, { action: 'auth.login_refused', details: { why: 'account_blocked' } });
    throw new AppError('ACCOUNT_BLOCKED', 'This account is blocked');
  }

  const options = loginOptions(user);
  if (options.length === 0) {
    await writeAudit({ ...userActor, label: 'refused login' }, { action: 'auth.login_refused', details: { why: 'no_access' } });
    throw new AppError('NO_ACCESS', 'This account has no active role and no patient record');
  }

  let actor;
  if (asPatient) {
    if (!user.patientId) throw new AppError('INVALID_CHOICE', 'This account has no patient record');
    actor = actorForPatient(user);
  } else if (membershipId) {
    const membership = user.memberships.find((m) => m.id === membershipId);
    if (!membership) throw new AppError('INVALID_CHOICE', 'This membership is not active for this account');
    actor = actorForMembership(user, membership);
  } else if (options.length === 1) {
    const only = options[0];
    actor = only.asPatient
      ? actorForPatient(user)
      : actorForMembership(user, user.memberships.find((m) => m.id === only.membershipId));
  } else {
    throw new AppError('CHOOSE_MEMBERSHIP', 'Choose where you are working (or your own record)', { options });
  }

  const token = signSessionToken({ userId: actor.userId, membershipId: actor.membershipId });
  await writeAudit(actor, { action: 'auth.login' });
  return { token, expiresInSeconds: 15 * 60, session: publicSession(actor) };
}
