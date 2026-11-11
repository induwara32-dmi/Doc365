// API tests (supertest): login, JWT, the permission middleware and auditing.
import './guard.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { prisma } from '../src/db.js';
import { app } from '../src/app.js';
import { secureRouter } from '../src/http/secure-router.js';
import { errorHandler } from '../src/http/error-handler.js';
import { issueCard } from '../src/patients/card-service.js';
import {
  createTestFacility,
  createTestPatient,
  createTestUser,
  uniqueName,
  TEST_PASSWORD,
  TEST_ACTOR,
} from './helpers.js';

let hospital, lab, pharmacy, ministry, privateHospital;
let doctor, pharmacist, registrar, labStaff, twoJobsDoctor, patientUser, patient;

before(async () => {
  [hospital, lab, pharmacy, ministry, privateHospital] = await Promise.all([
    createTestFacility('HOSPITAL', 'Test General Hospital'),
    createTestFacility('LAB', 'Test Lab Colombo'),
    createTestFacility('PHARMACY'),
    createTestFacility('AUTHORITY'),
    createTestFacility('HOSPITAL', 'Test Private Hospital'),
  ]);
  patient = await createTestPatient({ familyName: uniqueName() });
  const card = await issueCard(patient.id, { actor: TEST_ACTOR });
  [doctor, pharmacist, registrar, labStaff, twoJobsDoctor, patientUser] = await Promise.all([
    createTestUser({ fullName: 'D. Perera', memberships: [{ facility: hospital, role: 'DOCTOR', jobTitle: 'Dr.' }] }),
    createTestUser({ memberships: [{ facility: pharmacy, role: 'PHARMACIST' }] }),
    createTestUser({ memberships: [{ facility: hospital, role: 'REGISTRAR' }] }),
    createTestUser({ fullName: 'A. Silva', memberships: [{ facility: lab, role: 'LAB_STAFF', jobTitle: 'MLT' }] }),
    createTestUser({
      fullName: 'K. Fernando',
      patientId: (await createTestPatient()).id, // also a patient
      memberships: [
        { facility: hospital, role: 'DOCTOR', jobTitle: 'Dr.' },
        { facility: privateHospital, role: 'DOCTOR', jobTitle: 'Dr.' },
      ],
    }),
    createTestUser({ fullName: 'P. Jayasinghe', patientId: (await createTestPatient()).id }),
  ]);
  await prisma.accessGrant.create({
    data: {
      patientId: patient.id,
      facilityId: hospital.id,
      cardId: card.id,
      grantedByUserId: doctor.user.id,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  });
});

after(async () => {
  await prisma.$disconnect();
});

async function loginAs(testUser, extra = {}) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: testUser.username, password: TEST_PASSWORD, ...extra });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// ---------- Login ----------

test('login returns a 15-minute JWT that holds only user id and membership id', async () => {
  const token = await loginAs(doctor);
  const payload = jwt.decode(token, { complete: true });

  assert.equal(payload.header.alg, 'HS256');
  assert.deepEqual(Object.keys(payload.payload).sort(), ['exp', 'iat', 'mid', 'sub']);
  assert.equal(payload.payload.sub, doctor.user.id);
  assert.equal(payload.payload.mid, doctor.memberships[0].id);
  assert.equal(payload.payload.exp - payload.payload.iat, 15 * 60);
});

test('a person with two jobs (and a patient record) must choose, then gets that membership', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: twoJobsDoctor.username, password: TEST_PASSWORD });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'CHOOSE_MEMBERSHIP');
  const options = res.body.error.details.options;
  assert.equal(options.length, 3); // two hospitals + own record
  assert.deepEqual(options.map((o) => o.facility ?? 'own record').sort(), [
    'Test General Hospital',
    'Test Private Hospital',
    'own record',
  ]);

  const privateJob = options.find((o) => o.facility === 'Test Private Hospital');
  const token = await loginAs(twoJobsDoctor, { membershipId: privateJob.membershipId });
  const me = await request(app).get('/api/me').set(bearer(token));
  assert.equal(me.body.session.label, 'Test Private Hospital, Dr. K. Fernando');

  const asPatient = await loginAs(twoJobsDoctor, { asPatient: true });
  const meAsPatient = await request(app).get('/api/me').set(bearer(asPatient));
  assert.equal(meAsPatient.body.session.role, 'PATIENT');
});

test('patient can log in using their Health ID in place of username', async () => {
  const p = await createTestPatient({ familyName: uniqueName() });
  await createTestUser({
    fullName: 'Health ID Login Patient',
    patientId: p.id,
  });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: p.healthId, password: TEST_PASSWORD });

  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.session.role, 'PATIENT');
  assert.equal(res.body.session.ownPatientId, p.id);
});

test('wrong password and unknown username give the same answer', async () => {
  const wrongPassword = await request(app)
    .post('/api/auth/login')
    .send({ username: doctor.username, password: 'not-the-password' });
  const unknownUser = await request(app)
    .post('/api/auth/login')
    .send({ username: `nobody-${uniqueName()}`, password: 'not-the-password' });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownUser.status, 401);
  assert.deepEqual(wrongPassword.body, unknownUser.body);
  assert.deepEqual(wrongPassword.body, { error: { code: 'INVALID_LOGIN', message: 'Invalid username or password' } });
});

test('failed logins are audited without the typed text', async () => {
  // Someone types their password into the username field
  const typedText = `MySecret-${uniqueName()}`;
  await request(app).post('/api/auth/login').send({ username: typedText, password: 'whatever-123' });
  await request(app).post('/api/auth/login').send({ username: doctor.username, password: typedText });

  // The typed text appears nowhere in the audit log
  const [{ count }] = await prisma.$queryRaw`
    SELECT count(*)::int AS count FROM "AuditLog" a WHERE a::text LIKE ${'%' + typedText + '%'}`;
  assert.equal(count, 0);

  const unknown = await prisma.auditLog.findFirst({
    where: { action: 'auth.login_failed', actorLabel: 'unknown username' },
    orderBy: { at: 'desc' },
  });
  assert.equal(unknown.userId, null);
  const known = await prisma.auditLog.findFirst({
    where: { action: 'auth.login_failed', userId: doctor.user.id },
    orderBy: { at: 'desc' },
  });
  assert.ok(known);
});

test('passwords and hashes never appear in responses or logs', async () => {
  const output = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  for (const level of Object.keys(original)) console[level] = (...args) => output.push(args.join(' '));
  let bodies;
  try {
    const someone = await createTestUser({ memberships: [{ facility: hospital, role: 'DOCTOR' }] });
    const login = await request(app).post('/api/auth/login').send({ username: someone.username, password: TEST_PASSWORD });
    const bad = await request(app).post('/api/auth/login').send({ username: someone.username, password: 'wrong-password' });
    const me = await request(app).get('/api/me').set(bearer(login.body.token));
    bodies = JSON.stringify([login.body, bad.body, me.body, someone.user]);
  } finally {
    Object.assign(console, original);
  }

  const everything = bodies + output.join('\n');
  assert.ok(!everything.includes(TEST_PASSWORD), 'password leaked');
  assert.ok(!everything.includes('wrong-password'), 'typed password leaked');
  assert.ok(!/\$2[aby]\$\d\d\$/.test(everything), 'bcrypt hash leaked');
  assert.ok(!everything.includes('passwordHash'), 'passwordHash field leaked');
});

test('passwords are stored as bcrypt hashes with cost 12', async () => {
  const row = await prisma.user.findUnique({ where: { id: doctor.user.id } });
  assert.match(row.passwordHash, /^\$2b\$12\$/);
});

// ---------- JWT ----------

test('an expired JWT is refused', async () => {
  const expired = jwt.sign(
    { mid: doctor.memberships[0].id, exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', subject: doctor.user.id },
  );
  const res = await request(app).get('/api/me').set(bearer(expired));
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
});

test('forged tokens are refused: wrong secret, alg "none", garbage, missing', async () => {
  const wrongSecret = jwt.sign({ mid: doctor.memberships[0].id }, 'x'.repeat(40), { subject: doctor.user.id });
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const algNone = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: doctor.user.id, mid: doctor.memberships[0].id })}.`;

  for (const token of [wrongSecret, algNone, 'garbage']) {
    const res = await request(app).get('/api/me').set(bearer(token));
    assert.equal(res.status, 401, token);
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
  }
  const missing = await request(app).get('/api/me');
  assert.equal(missing.status, 401);
  assert.equal(missing.body.error.code, 'UNAUTHENTICATED');
});

test('a blocked account or an ended membership stops working at once (valid token)', async () => {
  const blockedLater = await createTestUser({ memberships: [{ facility: hospital, role: 'DOCTOR' }] });
  const endedLater = await createTestUser({ memberships: [{ facility: hospital, role: 'DOCTOR' }] });
  const token1 = await loginAs(blockedLater);
  const token2 = await loginAs(endedLater);

  await prisma.user.update({ where: { id: blockedLater.user.id }, data: { status: 'BLOCKED' } });
  await prisma.staffMembership.update({ where: { id: endedLater.memberships[0].id }, data: { status: 'ENDED' } });

  const res1 = await request(app).get('/api/me').set(bearer(token1));
  assert.equal(res1.status, 401);
  assert.equal(res1.body.error.code, 'ACCOUNT_BLOCKED');
  const res2 = await request(app).get('/api/me').set(bearer(token2));
  assert.equal(res2.status, 401);
  assert.equal(res2.body.error.code, 'MEMBERSHIP_INACTIVE');
});

test('the server refuses to start with a JWT_SECRET shorter than 32 characters', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/config.js')"], {
    env: { ...process.env, JWT_SECRET: 'too-short' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /JWT_SECRET must be at least 32 characters/);
});

// ---------- Permissions ----------

test('a PHARMACIST cannot open a full record (403, and the attempt is audited)', async () => {
  const token = await loginAs(pharmacist);
  const res = await request(app).get(`/api/patients/${patient.healthId}`).set(bearer(token));
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
  assert.equal(res.body.patient, undefined);

  const denied = await prisma.auditLog.findFirst({
    where: { action: 'access.denied', userId: pharmacist.user.id },
    orderBy: { at: 'desc' },
  });
  assert.equal(denied.details.permission, 'record.view_full');
});

test('a DOCTOR can open the full record, and the view is audited with the membership label', async () => {
  const token = await loginAs(doctor);
  const res = await request(app).get(`/api/patients/${patient.healthId}`).set(bearer(token));
  assert.equal(res.status, 200);
  assert.equal(res.body.patient.resourceType, 'Patient');

  const view = await prisma.auditLog.findFirst({
    where: { action: 'patient.view', patientId: patient.id, userId: doctor.user.id },
  });
  assert.equal(view.membershipId, doctor.memberships[0].id);
  assert.equal(view.facilityId, hospital.id);
  assert.equal(view.actorLabel, 'Test General Hospital, Dr. D. Perera');
});

test('LAB_STAFF and a patient account cannot open someone’s full record either', async () => {
  for (const who of [labStaff, patientUser]) {
    const res = await request(app).get(`/api/patients/${patient.healthId}`).set(bearer(await loginAs(who)));
    assert.equal(res.status, 403);
  }
});

test('a route with no permission rule is refused, even with a valid token', async () => {
  const handlerRan = [];
  const testRoutes = secureRouter();
  testRoutes.get('/no-permission', undefined, (req, res) => handlerRan.push('none') && res.json({}));
  testRoutes.get('/unknown-permission', 'made.up.permission', (req, res) => handlerRan.push('made-up') && res.json({}));
  const testApp = express().use(testRoutes.router).use(errorHandler);

  const token = await loginAs(doctor);
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (msg) => warnings.push(msg);
  try {
    for (const path of ['/no-permission', '/unknown-permission']) {
      const res = await request(testApp).get(path).set(bearer(token));
      assert.equal(res.status, 403, path);
      assert.equal(res.body.error.code, 'NO_PERMISSION_RULE');
    }
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(handlerRan, []);
  assert.equal(warnings.length, 2);
});

// ---------- Card changes through the API are audited ----------

test('a REGISTRAR blocks a card: the audit row names the registrar’s membership', async () => {
  const cardOwner = await createTestPatient();
  const card = await issueCard(cardOwner.id);
  const token = await loginAs(registrar);

  const res = await request(app)
    .post(`/api/cards/${card.serial}/block`)
    .set(bearer(token))
    .send({ reason: 'Reported lost at the desk' });
  assert.equal(res.status, 200);
  assert.equal(res.body.card.status, 'BLOCKED');

  const row = await prisma.auditLog.findFirst({ where: { action: 'card.block', targetId: card.serial } });
  assert.equal(row.userId, registrar.user.id);
  assert.equal(row.membershipId, registrar.memberships[0].id);
  assert.equal(row.reason, 'Reported lost at the desk');

  // Blocking again: the card is no longer ACTIVE (409)
  const again = await request(app).post(`/api/cards/${card.serial}/block`).set(bearer(token)).send({ reason: 'again' });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'CARD_NOT_ACTIVE');
});

test('a REGISTRAR replaces a card through the API; a DOCTOR may not', async () => {
  const cardOwner = await createTestPatient();
  await issueCard(cardOwner.id);

  const doctorTry = await request(app)
    .post(`/api/patients/${cardOwner.healthId}/cards/replace`)
    .set(bearer(await loginAs(doctor)))
    .send({ oldStatus: 'BLOCKED', reason: 'Lost' });
  assert.equal(doctorTry.status, 403);

  const res = await request(app)
    .post(`/api/patients/${cardOwner.healthId}/cards/replace`)
    .set(bearer(await loginAs(registrar)))
    .send({ oldStatus: 'BLOCKED', reason: 'Lost card' });
  assert.equal(res.status, 200);
  assert.equal(res.body.card.status, 'ACTIVE');
  assert.deepEqual(JSON.parse(res.body.qrPayload), { healthId: cardOwner.healthId, serial: res.body.card.serial });
  assert.equal(await prisma.auditLog.count({ where: { action: 'card.replace', patientId: cardOwner.id } }), 1);
});

test('invalid request bodies get 400 with field names but not the values', async () => {
  const res = await request(app)
    .post('/api/cards/CARD-0000-0000-0000/block')
    .set(bearer(await loginAs(registrar)))
    .send({ reason: 7 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(res.body.error.details.fields.map((f) => f.field), ['reason']);
});

test('unknown routes get 404', async () => {
  const res = await request(app).get('/api/does-not-exist');
  assert.equal(res.status, 404);
});
