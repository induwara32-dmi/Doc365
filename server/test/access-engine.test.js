// Tests for Phase 5: Access Engine, Three Keys Rule, Emergency Break-Glass, and Consent Controls.
import './guard.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';
import { signBundle } from '../src/core/sign.js';
import { issueCard, blockCard } from '../src/patients/card-service.js';
import { createRecord } from '../src/records/record-service.js';
import {
  createTestPatient,
  createTestFacility,
  createTestUser,
  TEST_PASSWORD,
  TEST_ACTOR,
} from './helpers.js';

let hospitalA;
let hospitalB;
let labFacility;
let labKeyPair;
let doctorA;
let doctorB;
let mltStaff;
let adultPatient;
let adultUser;
let adultCard;
let childPatient;
let childCard;

before(async () => {
  // Facilities
  hospitalA = await createTestFacility('HOSPITAL', 'Test National Hospital');
  hospitalB = await createTestFacility('HOSPITAL', 'Test Base Hospital Negombo');

  const kp = crypto.generateKeyPairSync('ed25519');
  labKeyPair = {
    publicKeyPem: kp.publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: kp.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  labFacility = await prisma.facility.create({
    data: {
      code: `test-lab-${crypto.randomUUID().slice(0, 8)}`,
      name: 'Test Central Lab',
      type: 'LAB',
      publicKeyPem: labKeyPair.publicKeyPem,
    },
  });

  // Clinical staff users
  doctorA = await createTestUser({
    fullName: 'Dr. A. Perera',
    memberships: [{ facility: hospitalA, role: 'DOCTOR', jobTitle: 'Consultant' }],
  });

  doctorB = await createTestUser({
    fullName: 'Dr. B. Silva',
    memberships: [{ facility: hospitalB, role: 'DOCTOR', jobTitle: 'Dr.' }],
  });

  mltStaff = await createTestUser({
    fullName: 'MLT Central',
    memberships: [{ facility: labFacility, role: 'LAB_STAFF', jobTitle: 'MLT' }],
  });

  // Adult patient (age 30)
  adultPatient = await createTestPatient({
    familyName: 'Jayawardena',
    dateOfBirth: new Date('1994-02-15'),
    sex: 'female',
  });
  adultCard = await issueCard(adultPatient.id, { actor: TEST_ACTOR });

  adultUser = await createTestUser({
    fullName: 'Kamani Jayawardena',
    patientId: adultPatient.id,
  });

  // Child patient (age 8) with adult as guardian
  childPatient = await createTestPatient({
    familyName: 'Jayawardena',
    dateOfBirth: new Date('2018-06-10'),
    sex: 'male',
  });
  childCard = await issueCard(childPatient.id, { actor: TEST_ACTOR });

  await prisma.guardianLink.create({
    data: {
      childId: childPatient.id,
      guardianId: adultPatient.id,
      relationship: 'MOTHER',
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

function makeBundle(healthId, reportId = 'rep-' + crypto.randomUUID().slice(0, 8), isSensitive = false) {
  return {
    resourceType: 'Bundle',
    id: `bundle-${reportId}`,
    type: 'collection',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          id: 'p-01',
          identifier: [{ system: 'urn:doc365:demo-phn', value: healthId }],
        },
      },
      {
        resource: {
          resourceType: 'DiagnosticReport',
          id: reportId,
          status: 'final',
          code: { text: isSensitive ? 'HIV Antibody Screening' : 'Lipid Profile' },
        },
      },
    ],
  };
}

// ---------- 1. Three Keys Card Scan & Access Grants ----------

test('Three Keys rule: Doctor cannot open full record without active card scan grant', async () => {
  const docTokenA = await loginAs(doctorA);

  // Attempt to view full record without card scan grant
  const res = await request(app)
    .get(`/api/patients/${adultPatient.healthId}`)
    .set(bearer(docTokenA));

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'NO_ACTIVE_GRANT');
});

test('Card scan creates 90-day AccessGrant, enabling doctor consultation access', async () => {
  const docTokenA = await loginAs(doctorA);

  // Scan card at Hospital A
  const scanRes = await request(app)
    .post('/api/access/scan')
    .set(bearer(docTokenA))
    .send({ healthId: adultPatient.healthId, cardSerial: adultCard.serial });

  assert.equal(scanRes.status, 201);
  assert.ok(scanRes.body.grant.id);
  assert.equal(scanRes.body.grant.facilityId, hospitalA.id);
  assert.equal(scanRes.body.grant.isBreakGlass, false);

  // Doctor at Hospital A can now open full record
  const viewRes = await request(app)
    .get(`/api/patients/${adultPatient.healthId}`)
    .set(bearer(docTokenA));

  assert.equal(viewRes.status, 200);
  assert.ok(viewRes.body.patient);

  // Doctor at Hospital B still has NO access (Three Keys: Facility scoped)
  const docTokenB = await loginAs(doctorB);
  const viewBRes = await request(app)
    .get(`/api/patients/${adultPatient.healthId}`)
    .set(bearer(docTokenB));

  assert.equal(viewBRes.status, 403);
  assert.equal(viewBRes.body.error.code, 'NO_ACTIVE_GRANT');
});

test('Scanning a BLOCKED card is refused with CARD_NOT_ACTIVE', async () => {
  const patientBlocked = await createTestPatient();
  const card = await issueCard(patientBlocked.id, { actor: TEST_ACTOR });
  await blockCard(card.serial, 'Card lost by patient', TEST_ACTOR);

  const docTokenA = await loginAs(doctorA);
  const scanRes = await request(app)
    .post('/api/access/scan')
    .set(bearer(docTokenA))
    .send({ healthId: patientBlocked.healthId, cardSerial: card.serial });

  assert.equal(scanRes.status, 409);
  assert.equal(scanRes.body.error.code, 'CARD_NOT_ACTIVE');
});

// ---------- 2. Sensitive Records & Patient PIN ----------

test('Sensitive records are excluded from default doctor view and require Patient PIN', async () => {
  const docTokenA = await loginAs(doctorA);
  const patientToken = await loginAs(adultUser, { asPatient: true });

  // Upload 1 standard record and 1 sensitive record for the patient
  const mltActor = {
    userId: mltStaff.user.id,
    membershipId: mltStaff.memberships[0].id,
    facilityId: labFacility.id,
    role: 'LAB_STAFF',
    label: 'MLT Central',
  };

  const bNormal = makeBundle(adultPatient.healthId, 'norm-' + crypto.randomUUID().slice(0, 8), false);
  const pNormal = signBundle(bNormal, labKeyPair.privateKeyPem, `Organization/${labFacility.code}`);
  await createRecord({ bundle: bNormal, provenance: pNormal, isSensitive: false }, { actor: mltActor });

  const bSens = makeBundle(adultPatient.healthId, 'sens-' + crypto.randomUUID().slice(0, 8), true);
  const pSens = signBundle(bSens, labKeyPair.privateKeyPem, `Organization/${labFacility.code}`);
  const { record: sensRec } = await createRecord({ bundle: bSens, provenance: pSens, isSensitive: true }, { actor: mltActor });

  // Patient sets a 4-digit PIN
  const setPinRes = await request(app)
    .post(`/api/patients/${adultPatient.healthId}/pin`)
    .set(bearer(patientToken))
    .send({ pin: '5824' });
  assert.equal(setPinRes.status, 200);

  // Doctor views without PIN: sensitive record is masked
  const viewNoPin = await request(app)
    .get(`/api/patients/${adultPatient.healthId}`)
    .set(bearer(docTokenA));
  assert.equal(viewNoPin.status, 200);
  assert.ok(!viewNoPin.body.records.some((r) => r.id === sensRec.id), 'Sensitive record masked without PIN');

  // Doctor views with WRONG PIN: rejected with 401 INVALID_PIN
  const viewWrongPin = await request(app)
    .get(`/api/patients/${adultPatient.healthId}`)
    .set(bearer(docTokenA))
    .set('x-patient-pin', '9999');
  assert.equal(viewWrongPin.status, 401);
  assert.equal(viewWrongPin.body.error.code, 'INVALID_PIN');

  // Doctor views with CORRECT PIN: sensitive record is included!
  const viewCorrectPin = await request(app)
    .get(`/api/patients/${adultPatient.healthId}`)
    .set(bearer(docTokenA))
    .set('x-patient-pin', '5824');
  assert.equal(viewCorrectPin.status, 200);
  assert.ok(viewCorrectPin.body.records.some((r) => r.id === sensRec.id), 'Sensitive record visible with correct PIN');
});

// ---------- 3. Emergency Break-Glass & Emergency Summary ----------

test('Emergency Summary is accessible cardless without an active AccessGrant', async () => {
  const docTokenB = await loginAs(doctorB); // Hospital B has no card grant for adultPatient

  const res = await request(app)
    .get(`/api/patients/${adultPatient.healthId}/emergency`)
    .set(bearer(docTokenB));

  assert.equal(res.status, 200);
  assert.equal(res.body.patient.healthId, adultPatient.healthId);
  assert.ok(res.body.emergencySummary);

  const audit = await prisma.auditLog.findFirst({
    where: { action: 'access.emergency_summary', patientId: adultPatient.id },
    orderBy: { at: 'desc' },
  });
  assert.ok(audit, 'Emergency summary view was audited');
});

test('Emergency Break-Glass creates override grant and writes EMERGENCY_OVERRIDE_ACCESSED audit trail', async () => {
  const docTokenB = await loginAs(doctorB);
  const justification = 'Patient unconscious in ER following road traffic accident. No family or card available.';

  // Break-glass request
  const bgRes = await request(app)
    .post('/api/access/break-glass')
    .set(bearer(docTokenB))
    .send({ healthId: adultPatient.healthId, reason: justification });

  assert.equal(bgRes.status, 201);
  assert.ok(bgRes.body.grant.isBreakGlass);
  assert.match(bgRes.body.warning, /EMERGENCY_OVERRIDE_ACCESSED/);

  // Doctor B can now open full record
  const viewRes = await request(app)
    .get(`/api/patients/${adultPatient.healthId}`)
    .set(bearer(docTokenB));
  assert.equal(viewRes.status, 200);

  // Verify high-priority audit trail
  const audit = await prisma.auditLog.findFirst({
    where: { action: 'access.break_glass', patientId: adultPatient.id },
    orderBy: { at: 'desc' },
  });
  assert.ok(audit);
  assert.equal(audit.reason, justification);
  assert.equal(audit.details.overrideCode, 'EMERGENCY_OVERRIDE_ACCESSED');

  // Too short justification is rejected
  const badRes = await request(app)
    .post('/api/access/break-glass')
    .set(bearer(docTokenB))
    .send({ healthId: adultPatient.healthId, reason: 'Emergency' });
  assert.equal(badRes.status, 400);
  assert.equal(badRes.body.error.code, 'INVALID_BREAK_GLASS_REASON');
});

// ---------- 4. Patient Controls (Block, Hide, Opt-Out) ----------

test('Patient Provider Blocking: blocked facility cannot obtain access or view records', async () => {
  const patientToken = await loginAs(adultUser, { asPatient: true });
  const docTokenA = await loginAs(doctorA);

  // Patient blocks Hospital A
  const blockRes = await request(app)
    .post(`/api/patients/${adultPatient.healthId}/blocks`)
    .set(bearer(patientToken))
    .send({ facilityId: hospitalA.id, reason: 'Patient preference' });
  assert.equal(blockRes.status, 201);
  const blockId = blockRes.body.block.id;

  // Existing access grant for Hospital A was revoked, and new card scans fail
  const viewRes = await request(app)
    .get(`/api/patients/${adultPatient.healthId}`)
    .set(bearer(docTokenA));
  assert.equal(viewRes.status, 403);
  assert.equal(viewRes.body.error.code, 'BLOCKED_BY_PATIENT');

  const scanRes = await request(app)
    .post('/api/access/scan')
    .set(bearer(docTokenA))
    .send({ healthId: adultPatient.healthId, cardSerial: adultCard.serial });
  assert.equal(scanRes.status, 403);
  assert.equal(scanRes.body.error.code, 'BLOCKED_BY_PATIENT');

  // Patient unblocks Hospital A
  const unblockRes = await request(app)
    .post(`/api/patients/${adultPatient.healthId}/blocks/${blockId}/unblock`)
    .set(bearer(patientToken));
  assert.equal(unblockRes.status, 200);

  // Scan works again after unblock
  const scanOk = await request(app)
    .post('/api/access/scan')
    .set(bearer(docTokenA))
    .send({ healthId: adultPatient.healthId, cardSerial: adultCard.serial });
  assert.equal(scanOk.status, 201);
});

test('Document Hiding masks document from doctor view while visible to patient', async () => {
  const patientToken = await loginAs(adultUser, { asPatient: true });
  const docTokenA = await loginAs(doctorA);

  const mltActor = {
    userId: mltStaff.user.id,
    membershipId: mltStaff.memberships[0].id,
    facilityId: labFacility.id,
    role: 'LAB_STAFF',
    label: 'MLT Central',
  };

  const bundle = makeBundle(adultPatient.healthId, 'hide-rep-' + crypto.randomUUID().slice(0, 8));
  const prov = signBundle(bundle, labKeyPair.privateKeyPem, `Organization/${labFacility.code}`);
  const { record } = await createRecord({ bundle, provenance: prov }, { actor: mltActor });

  // Patient hides this record lineage
  const hideRes = await request(app)
    .post(`/api/patients/${adultPatient.healthId}/hide`)
    .set(bearer(patientToken))
    .send({ lineageId: record.lineageId, reason: 'Personal preference' });
  assert.equal(hideRes.status, 201);

  // Doctor does NOT see it in records list
  const docView = await request(app)
    .get(`/api/patients/${adultPatient.healthId}`)
    .set(bearer(docTokenA));
  assert.ok(!docView.body.records.some((r) => r.lineageId === record.lineageId));

  // Direct fetch by ID as doctor returns 404 RECORD_NOT_FOUND
  const docSingle = await request(app)
    .get(`/api/records/${record.id}`)
    .set(bearer(docTokenA));
  assert.equal(docSingle.status, 404);

  // Patient himself DOES see it, tagged with isHidden: true
  const patView = await request(app)
    .get(`/api/patients/${adultPatient.healthId}/records`)
    .set(bearer(patientToken));
  const found = patView.body.records.find((r) => r.lineageId === record.lineageId);
  assert.ok(found);
  assert.equal(found.isHidden, true);

  // Patient unhides it
  const unhideRes = await request(app)
    .post(`/api/patients/${adultPatient.healthId}/unhide`)
    .set(bearer(patientToken))
    .send({ lineageId: record.lineageId });
  assert.equal(unhideRes.status, 200);

  // Doctor can now view it again
  const docViewAgain = await request(app)
    .get(`/api/patients/${adultPatient.healthId}`)
    .set(bearer(docTokenA));
  assert.ok(docViewAgain.body.records.some((r) => r.lineageId === record.lineageId));
});

test('Patient Opt-Out blocks routine clinical access and revokes existing grants', async () => {
  const patientToken = await loginAs(adultUser, { asPatient: true });
  const docTokenA = await loginAs(doctorA);

  // Opt out
  const optRes = await request(app)
    .post(`/api/patients/${adultPatient.healthId}/opt-out`)
    .set(bearer(patientToken))
    .send({ reason: 'Privacy preference' });
  assert.equal(optRes.status, 200);
  assert.equal(optRes.body.optedOut, true);

  // Doctor access refused
  const docView = await request(app)
    .get(`/api/patients/${adultPatient.healthId}`)
    .set(bearer(docTokenA));
  assert.equal(docView.status, 403);
  assert.equal(docView.body.error.code, 'PATIENT_OPTED_OUT');

  // New card scan also refused
  const scanRes = await request(app)
    .post('/api/access/scan')
    .set(bearer(docTokenA))
    .send({ healthId: adultPatient.healthId, cardSerial: adultCard.serial });
  assert.equal(scanRes.status, 403);
  assert.equal(scanRes.body.error.code, 'PATIENT_OPTED_OUT');

  // Opt back in
  const optInRes = await request(app)
    .post(`/api/patients/${adultPatient.healthId}/opt-in`)
    .set(bearer(patientToken));
  assert.equal(optInRes.status, 200);
  assert.equal(optInRes.body.optedOut, false);
});

// ---------- 5. Age & Parental Control vs Independent Access ----------

test('Guardian manages child < 16, but access ends at 16', async () => {
  const adultToken = await loginAs(adultUser, { asPatient: true });

  // Mother views child record (< 16 years) -> permitted
  const childView = await request(app)
    .get(`/api/patients/${childPatient.healthId}/records`)
    .set(bearer(adultToken));
  assert.equal(childView.status, 200);
  assert.equal(childView.body.patient.resourceType, 'Patient');

  // Mother sets PIN for child -> permitted
  const pinRes = await request(app)
    .post(`/api/patients/${childPatient.healthId}/pin`)
    .set(bearer(adultToken))
    .send({ pin: '4321' });
  assert.equal(pinRes.status, 200);

  // Now create a teenager who turned 16 today
  const teenPatient = await createTestPatient({
    familyName: 'Jayasinghe',
    dateOfBirth: new Date('2010-11-07'), // 16 years old
  });
  await prisma.guardianLink.create({
    data: {
      childId: teenPatient.id,
      guardianId: adultPatient.id,
      relationship: 'MOTHER',
    },
  });

  // Mother attempts to access teenager record -> refused GUARDIAN_ACCESS_ENDED
  const teenView = await request(app)
    .get(`/api/patients/${teenPatient.healthId}/records`)
    .set(bearer(adultToken));
  assert.equal(teenView.status, 403);
  assert.equal(teenView.body.error.code, 'GUARDIAN_ACCESS_ENDED');
});

// ---------- 6. "Who Viewed My Record" Access Ledger ----------

test('Patient can view complete access ledger timeline', async () => {
  const patientToken = await loginAs(adultUser, { asPatient: true });

  const res = await request(app)
    .get(`/api/patients/${adultPatient.healthId}/access-ledger`)
    .set(bearer(patientToken));

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.entries));
  assert.ok(res.body.entries.length > 0);

  const actions = res.body.entries.map((e) => e.action);
  assert.ok(actions.includes('access.grant_created'), 'Card scan recorded in ledger');
  assert.ok(actions.includes('access.break_glass'), 'Break-glass override recorded in ledger');
});
