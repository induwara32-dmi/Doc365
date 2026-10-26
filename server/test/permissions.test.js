// Tests for the permission matrix (pure, no database) and the role/facility rule.
import './guard.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prisma } from '../src/db.js';
import {
  PERMISSIONS,
  ALLOWED_FACILITY_TYPES,
  PUBLIC,
  ALWAYS,
  OWN_FACILITY,
  OWN_ENTRY,
  PATIENT,
  can,
} from '../src/auth/permissions.js';
import { createMembership } from '../src/auth/account-service.js';
import { createTestFacility, createTestUser, TEST_ACTOR } from './helpers.js';

after(async () => {
  await prisma.$disconnect();
});

const STAFF_ROLES = ['LAB_STAFF', 'HOSPITAL_STAFF', 'DOCTOR', 'PHARMACIST', 'REGISTRAR', 'ADMIN'];
const actor = (role, extra = {}) => ({ role, userId: 'user-1', facilityId: 'facility-1', ...extra });

test('a PHARMACIST cannot open a full record (nor LAB_STAFF, REGISTRAR, ADMIN, PATIENT)', () => {
  for (const role of ['PHARMACIST', 'LAB_STAFF', 'REGISTRAR', 'ADMIN', PATIENT]) {
    assert.equal(can(actor(role), 'record.view_full'), false, role);
  }
  assert.equal(can(actor('DOCTOR'), 'record.view_full'), true);
  assert.equal(can(actor('HOSPITAL_STAFF'), 'record.view_full'), true);
});

test('LAB_STAFF can correct only their own lab’s results', () => {
  const labStaff = actor('LAB_STAFF', { facilityId: 'lab-A' });
  assert.equal(can(labStaff, 'record.correct', { facilityId: 'lab-A' }), true);
  assert.equal(can(labStaff, 'record.correct', { facilityId: 'lab-B' }), false);
  assert.equal(can(labStaff, 'record.correct'), false); // no record given: denied
});

test('HOSPITAL_STAFF correct own facility’s records; DOCTOR only own entries; PHARMACIST never', () => {
  const hospitalStaff = actor('HOSPITAL_STAFF', { facilityId: 'hosp-A' });
  assert.equal(can(hospitalStaff, 'record.correct', { facilityId: 'hosp-A' }), true);
  assert.equal(can(hospitalStaff, 'record.correct', { facilityId: 'hosp-B' }), false);

  const doctor = actor('DOCTOR', { userId: 'dr-1' });
  assert.equal(can(doctor, 'record.correct', { createdByUserId: 'dr-1', facilityId: 'x' }), true);
  assert.equal(can(doctor, 'record.correct', { createdByUserId: 'dr-2', facilityId: 'facility-1' }), false);

  assert.equal(can(actor('PHARMACIST'), 'record.correct', { facilityId: 'facility-1' }), false);
});

test('default deny: unknown permissions and unlisted roles are refused', () => {
  assert.equal(can(actor('ADMIN'), 'made.up.permission'), false);
  assert.equal(can(actor('DOCTOR'), undefined), false);
  assert.equal(can(actor('PHARMACIST'), 'audit.view'), false);
  assert.equal(can({ role: 'SOMETHING_ELSE' }, 'session.view_self'), false);
  assert.equal(can(undefined, 'record.view_full'), false);
});

test('the matrix only uses known roles and known rule values', () => {
  const roles = new Set([...STAFF_ROLES, PATIENT]);
  const values = new Set([ALWAYS, OWN_FACILITY, OWN_ENTRY]);
  for (const [permission, rules] of Object.entries(PERMISSIONS)) {
    if (rules === PUBLIC) continue;
    for (const [role, value] of Object.entries(rules)) {
      assert.ok(roles.has(role), `${permission}: unknown role ${role}`);
      assert.ok(values.has(value), `${permission}: unknown rule ${value}`);
    }
  }
  // Only logging in is public
  assert.deepEqual(
    Object.entries(PERMISSIONS).filter(([, r]) => r === PUBLIC).map(([p]) => p),
    ['auth.login'],
  );
});

test('every API route names a permission that exists in the matrix', () => {
  const source = readFileSync(new URL('../src/routes/api.js', import.meta.url), 'utf8');
  const routes = [...source.matchAll(/api\.(get|post)\('([^']+)', '([^']+)'/g)];
  assert.ok(routes.length >= 5);
  for (const [, method, path, permission] of routes) {
    assert.ok(PERMISSIONS[permission], `${method.toUpperCase()} ${path}: no rule for "${permission}"`);
  }
});

test('the allowed role/facility-type pairs match DESIGN.md section 5', () => {
  assert.deepEqual(ALLOWED_FACILITY_TYPES, {
    DOCTOR: ['HOSPITAL', 'CLINIC'],
    HOSPITAL_STAFF: ['HOSPITAL'],
    LAB_STAFF: ['LAB'],
    PHARMACIST: ['PHARMACY'],
    REGISTRAR: ['HOSPITAL', 'AUTHORITY'],
    ADMIN: ['AUTHORITY'],
  });
});

test('createMembership allows exactly those pairs, for every role and facility type', async () => {
  const types = ['HOSPITAL', 'LAB', 'CLINIC', 'PHARMACY', 'AUTHORITY'];
  const facilities = Object.fromEntries(await Promise.all(types.map(async (t) => [t, await createTestFacility(t)])));
  const { user } = await createTestUser();

  for (const role of STAFF_ROLES) {
    for (const type of types) {
      const allowed = ALLOWED_FACILITY_TYPES[role].includes(type);
      const attempt = createMembership({ userId: user.id, facilityId: facilities[type].id, role }, { actor: TEST_ACTOR });
      if (allowed) {
        assert.equal((await attempt).role, role, `${role} at ${type} should be allowed`);
      } else {
        await assert.rejects(attempt, (err) => err.code === 'ROLE_NOT_ALLOWED_AT_FACILITY', `${role} at ${type}`);
      }
    }
  }
});

test('a non-AUTHORITY facility without a public key is refused by the database', async () => {
  await assert.rejects(
    prisma.facility.create({ data: { code: `test-nokey-${Date.now()}`, name: 'No key lab', type: 'LAB' } }),
    /Facility_key_required/,
  );
});
