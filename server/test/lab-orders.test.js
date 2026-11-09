import './guard.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';
import {
  createTestPatient,
  createTestFacility,
  createTestUser,
  TEST_PASSWORD,
  TEST_ACTOR,
} from './helpers.js';
import { createFacility } from '../src/auth/account-service.js';
import { signBundle } from '../src/core/sign.js';

function generateEd25519KeyPair() {
  const kp = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyPem: kp.publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: kp.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

function makeSampleBundle(healthId, extraEntries = []) {
  return {
    resourceType: 'Bundle',
    id: `bundle-${Date.now()}`,
    type: 'collection',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          id: 'p-01',
          identifier: [{ system: 'urn:doc365:demo-phn', value: healthId }],
        },
      },
      ...extraEntries.map((res) => ({ resource: res })),
    ],
  };
}

async function loginAs(username, membershipId = undefined, asPatient = false) {
  const payload = { username, password: TEST_PASSWORD };
  if (membershipId) payload.membershipId = membershipId;
  if (asPatient) payload.asPatient = true;
  const res = await request(app)
    .post('/api/auth/login')
    .send(payload);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

async function issueTestCard(patientId) {
  return prisma.card.create({
    data: {
      patientId,
      serial: `CARD-LAB-${Math.random().toString(36).slice(2, 11).toUpperCase()}`,
      status: 'ACTIVE',
    },
  });
}

test('Phase 7: Doctor creates Lab Order requiring Three Keys active AccessGrant', async () => {
  const hospital = await createTestFacility('HOSPITAL', 'Lab Order Test Hospital');
  const { user: doctorUser, username: doctorUsername, memberships: [docMem] } = await createTestUser({
    memberships: [{ facility: hospital, role: 'DOCTOR', jobTitle: 'Consultant Physician' }],
  });
  const doctorToken = await loginAs(doctorUsername, docMem.id);

  const patient = await createTestPatient({ givenName: 'Kamal', familyName: 'Perera' });
  const card = await issueTestCard(patient.id);

  // 1. Without active AccessGrant: 403 NO_ACTIVE_GRANT
  const blockedRes = await request(app)
    .post('/api/lab-orders')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      testCode: '1558-6',
      testName: 'Fasting Plasma Glucose',
      priority: 'ROUTINE',
      clinicalNotes: 'Check fasting blood sugar following metformin adjustment',
    });

  assert.equal(blockedRes.status, 403);
  assert.equal(blockedRes.body.error?.code, 'NO_ACTIVE_GRANT');

  // 2. Doctor scans card to obtain 90-day grant
  const scanRes = await request(app)
    .post('/api/access/scan')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ healthId: patient.healthId, cardSerial: card.serial });
  assert.equal(scanRes.status, 201);

  // 3. Doctor successfully creates lab order
  const orderRes = await request(app)
    .post('/api/lab-orders')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      testCode: '1558-6',
      testName: 'Fasting Plasma Glucose',
      priority: 'ROUTINE',
      clinicalNotes: 'Check fasting blood sugar following metformin adjustment',
    });

  assert.equal(orderRes.status, 201);
  const { order } = orderRes.body;
  assert.ok(order.orderCode.startsWith('ORD-'));
  assert.equal(order.status, 'ORDERED');
  assert.equal(order.testCode, '1558-6');
  assert.equal(order.testName, 'Fasting Plasma Glucose');
  assert.equal(order.fhir.resourceType, 'ServiceRequest');
  assert.equal(order.fhir.status, 'active');
  assert.equal(order.fhir.priority, 'routine');
});

test('Phase 7: Laboratory MLT views pending orders, uploads results, and completes order', async () => {
  // Facility with signing key for MLT
  const keyPair = generateEd25519KeyPair();
  const lab = await createFacility(
    {
      code: `test-lab-${crypto.randomUUID().slice(0, 8)}`,
      name: 'Apex Pathology Lab',
      type: 'LAB',
      publicKeyPem: keyPair.publicKeyPem,
    },
    { actor: TEST_ACTOR },
  );
  const { username: mltUsername, memberships: [mltMem] } = await createTestUser({
    memberships: [{ facility: lab, role: 'LAB_STAFF', jobTitle: 'MLT' }],
  });
  const mltToken = await loginAs(mltUsername, mltMem.id);

  const hospital = await createTestFacility('HOSPITAL', 'General Hospital');
  const { username: docUsername, memberships: [docMem] } = await createTestUser({
    memberships: [{ facility: hospital, role: 'DOCTOR', jobTitle: 'Physician' }],
  });
  const docToken = await loginAs(docUsername, docMem.id);

  const patient = await createTestPatient({ givenName: 'Sunil', familyName: 'De Silva' });
  const card = await issueTestCard(patient.id);

  // Doctor scans card and creates order
  await request(app)
    .post('/api/access/scan')
    .set('Authorization', `Bearer ${docToken}`)
    .send({ healthId: patient.healthId, cardSerial: card.serial });

  const createOrderRes = await request(app)
    .post('/api/lab-orders')
    .set('Authorization', `Bearer ${docToken}`)
    .send({
      patientHealthId: patient.healthId,
      testCode: '4548-4',
      testName: 'Hemoglobin A1c',
      priority: 'URGENT',
      clinicalNotes: 'Review glycaemic control',
    });
  assert.equal(createOrderRes.status, 201);
  const labOrder = createOrderRes.body.order;

  // MLT fetches pending orders for the patient
  const pendingRes = await request(app)
    .get(`/api/patients/${patient.healthId}/lab-orders?status=ORDERED`)
    .set('Authorization', `Bearer ${mltToken}`);
  assert.equal(pendingRes.status, 200);
  assert.equal(pendingRes.body.orders.length, 1);
  assert.equal(pendingRes.body.orders[0].id, labOrder.id);
  assert.equal(pendingRes.body.orders[0].priority, 'URGENT');

  // MLT creates a signed DiagnosticReport bundle with Observation
  const bundle = makeSampleBundle(patient.healthId, [
    {
      resourceType: 'DiagnosticReport',
      id: 'report-a1c-1',
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'Hemoglobin A1c' }],
        text: 'Hemoglobin A1c',
      },
      subject: { reference: `Patient/${patient.healthId}` },
      result: [{ reference: 'Observation/obs-a1c-1' }],
    },
    {
      resourceType: 'Observation',
      id: 'obs-a1c-1',
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'Hemoglobin A1c' }],
        text: 'HbA1c',
      },
      subject: { reference: `Patient/${patient.healthId}` },
      valueQuantity: {
        value: 6.8,
        unit: '%',
        system: 'http://unitsofmeasure.org',
        code: '%',
      },
      referenceRange: [
        {
          text: '4.0 - 5.6 % (Normal)',
        },
      ],
    },
  ]);

  const provenance = signBundle(bundle, keyPair.privateKeyPem, `Organization/${lab.code}`);

  const uploadRes = await request(app)
    .post('/api/records')
    .set('Authorization', `Bearer ${mltToken}`)
    .send({ bundle, provenance });
  assert.equal(uploadRes.status, 201);
  const uploadedRecord = uploadRes.body.record;

  // MLT completes the lab order with the linked record
  const completeRes = await request(app)
    .post(`/api/lab-orders/${labOrder.id}/complete`)
    .set('Authorization', `Bearer ${mltToken}`)
    .send({ resultRecordId: uploadedRecord.id });

  assert.equal(completeRes.status, 200);
  assert.equal(completeRes.body.order.status, 'COMPLETED');
  assert.equal(completeRes.body.order.resultRecordId, uploadedRecord.id);
  assert.ok(completeRes.body.order.completedAt);

  // Re-attempting to complete throws error
  const duplicateCompleteRes = await request(app)
    .post(`/api/lab-orders/${labOrder.id}/complete`)
    .set('Authorization', `Bearer ${mltToken}`)
    .send({ resultRecordId: uploadedRecord.id });
  assert.equal(duplicateCompleteRes.status, 400);
  assert.equal(duplicateCompleteRes.body.error?.code, 'ORDER_ALREADY_COMPLETED');
});

test('Phase 7: Patient self-access to lab orders & isolation against other patients', async () => {
  const hospital = await createTestFacility('HOSPITAL', 'Clinic Center');
  const { username: docUsername, memberships: [docMem] } = await createTestUser({
    memberships: [{ facility: hospital, role: 'DOCTOR', jobTitle: 'GP' }],
  });
  const docToken = await loginAs(docUsername, docMem.id);

  const patientA = await createTestPatient({ givenName: 'Anoma', familyName: 'Ranasinghe' });
  const cardA = await issueTestCard(patientA.id);
  const { username: patientUserA } = await createTestUser({ patientId: patientA.id });
  const patientTokenA = await loginAs(patientUserA, undefined, true);

  const patientB = await createTestPatient({ givenName: 'Buddhika', familyName: 'Jayawardena' });
  const { username: patientUserB } = await createTestUser({ patientId: patientB.id });
  const patientTokenB = await loginAs(patientUserB, undefined, true);

  // Doctor scans card A and creates order for Patient A
  await request(app)
    .post('/api/access/scan')
    .set('Authorization', `Bearer ${docToken}`)
    .send({ healthId: patientA.healthId, cardSerial: cardA.serial });

  await request(app)
    .post('/api/lab-orders')
    .set('Authorization', `Bearer ${docToken}`)
    .send({
      patientHealthId: patientA.healthId,
      testCode: '2093-3',
      testName: 'Total Cholesterol',
      priority: 'ROUTINE',
      clinicalNotes: 'Lipid profile screening',
    });

  // Patient A views their own orders: allowed
  const selfRes = await request(app)
    .get(`/api/patients/${patientA.healthId}/lab-orders`)
    .set('Authorization', `Bearer ${patientTokenA}`);
  assert.equal(selfRes.status, 200);
  assert.equal(selfRes.body.orders.length, 1);
  assert.equal(selfRes.body.orders[0].testCode, '2093-3');

  // Patient B tries to view Patient A's orders: forbidden (403)
  const snoopingRes = await request(app)
    .get(`/api/patients/${patientA.healthId}/lab-orders`)
    .set('Authorization', `Bearer ${patientTokenB}`);
  assert.equal(snoopingRes.status, 403);
  assert.equal(snoopingRes.body.error?.code, 'FORBIDDEN');
});
