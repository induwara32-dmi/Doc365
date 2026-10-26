// Shared helpers for tests. Not a test file itself (it does not end in .test.js).
import { generateKeyPairSync, randomInt, randomUUID } from 'node:crypto';
import { prisma } from '../src/db.js';
import { systemActor } from '../src/audit/audit-log.js';
import { createFacility, createUser, createMembership } from '../src/auth/account-service.js';

// The actor for changes made by tests (audited like any other change)
export const TEST_ACTOR = systemActor('test');

// A unique family name, so a test can find (or prove there are no) rows it made
export function uniqueName() {
  return `Test-${randomUUID().slice(0, 8)}`;
}

// A random date of birth between two years, and a demo NIC that fits it
// (real-calendar day of the year, +500 for women). Random, because test data
// is never deleted and NICs are unique.
export function randomBirthAndNic({ fromYear, toYear, sex = 'male' }) {
  const year = randomInt(fromYear, toYear + 1);
  const date = new Date(Date.UTC(year, 0, 1 + randomInt(0, 365)));
  const dayOfYear = Math.round((date - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  const dayCode = String(dayOfYear + (sex === 'female' ? 500 : 0)).padStart(3, '0');
  const serial = String(randomInt(0, 100_000)).padStart(5, '0'); // 4-digit serial + check digit
  return {
    dateOfBirth: date.toISOString().slice(0, 10),
    nic: `DEMO-NIC-${date.getUTCFullYear()}${dayCode}${serial}`,
  };
}

// A throwaway patient with a unique test Health ID. Never deleted (see CLAUDE.md).
// Pass fields to override the defaults, e.g. createTestPatient({ nic, dateOfBirth }).
export async function createTestPatient(overrides = {}) {
  return prisma.patient.create({
    data: {
      healthId: `DEMO-TEST-${randomUUID()}`,
      familyName: 'Test',
      sex: 'unknown',
      dateOfBirth: new Date('2000-01-01'),
      fhir: { resourceType: 'Patient' },
      ...overrides,
    },
  });
}

// All cards of a patient, oldest first
export async function cardsOf(patientId) {
  return prisma.card.findMany({ where: { patientId }, orderBy: { issuedAt: 'asc' } });
}

// ---------- Phase 3: facilities, users, memberships ----------

// One public key for all test facilities (tests never sign with it)
const TEST_PUBLIC_KEY = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });

// Test-only password. Real passwords are never written in code.
export const TEST_PASSWORD = 'test-only-password-123';

export async function createTestFacility(type, name) {
  const id = randomUUID().slice(0, 8);
  return createFacility(
    {
      code: `test-${type.toLowerCase()}-${id}`,
      name: name ?? `Test ${type} ${id}`,
      type,
      publicKeyPem: type === 'AUTHORITY' ? null : TEST_PUBLIC_KEY,
    },
    { actor: TEST_ACTOR },
  );
}

// A user with memberships: createTestUser({ memberships: [{ facility, role, jobTitle }], patientId })
// Returns { user, username, memberships }
export async function createTestUser({ memberships = [], patientId, fullName = 'Test Person' } = {}) {
  const username = `t.${randomUUID().slice(0, 12)}`;
  const user = await createUser({ username, password: TEST_PASSWORD, fullName, patientId }, { actor: TEST_ACTOR });
  const created = [];
  for (const m of memberships) {
    created.push(
      await createMembership(
        { userId: user.id, facilityId: m.facility.id, role: m.role, jobTitle: m.jobTitle },
        { actor: TEST_ACTOR },
      ),
    );
  }
  return { user, username, memberships: created };
}
