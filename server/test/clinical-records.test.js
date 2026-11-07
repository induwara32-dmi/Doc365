// Tests for Phase 4: Clinical records (signed, append-only, tamper-evident).
import './guard.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';
import { signBundle } from '../src/core/sign.js';
import { canonicalize } from '../src/core/canonicalize.js';
import { TRUST } from '../src/core/verify.js';
import {
  createTestPatient,
  createTestFacility,
  createTestUser,
  TEST_PASSWORD,
  TEST_ACTOR,
} from './helpers.js';
import { issueCard } from '../src/patients/card-service.js';
import {
  createRecord,
  correctRecord,
  getRecordById,
  getRecordHistory,
  verifyRecordIntegrity,
  bundleSha256,
} from '../src/records/record-service.js';

let labFacilityA;
let labFacilityB;
let labKeyPairA;
let labKeyPairB;
let mltUserA;
let mltUserB;
let doctorUser;
let patientUser;
let testPatient;

before(async () => {
  // Generate dedicated test keypairs for labs
  const kpA = crypto.generateKeyPairSync('ed25519');
  labKeyPairA = {
    publicKeyPem: kpA.publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: kpA.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };

  const kpB = crypto.generateKeyPairSync('ed25519');
  labKeyPairB = {
    publicKeyPem: kpB.publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: kpB.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };

  // Create test facilities in DB
  labFacilityA = await prisma.facility.create({
    data: {
      code: `test-lab-a-${crypto.randomUUID().slice(0, 8)}`,
      name: 'Test Lab Alpha',
      type: 'LAB',
      publicKeyPem: labKeyPairA.publicKeyPem,
    },
  });

  labFacilityB = await prisma.facility.create({
    data: {
      code: `test-lab-b-${crypto.randomUUID().slice(0, 8)}`,
      name: 'Test Lab Beta',
      type: 'LAB',
      publicKeyPem: labKeyPairB.publicKeyPem,
    },
  });

  const hospital = await createTestFacility('HOSPITAL', 'Test Base Hospital');

  // Create test patient
  testPatient = await createTestPatient({ familyName: 'Silva', sex: 'female' });

  // Create users
  mltUserA = await createTestUser({
    fullName: 'MLT Alpha',
    memberships: [{ facility: labFacilityA, role: 'LAB_STAFF', jobTitle: 'MLT' }],
  });

  mltUserB = await createTestUser({
    fullName: 'MLT Beta',
    memberships: [{ facility: labFacilityB, role: 'LAB_STAFF', jobTitle: 'MLT' }],
  });

  doctorUser = await createTestUser({
    fullName: 'Dr. Test',
    memberships: [{ facility: hospital, role: 'DOCTOR', jobTitle: 'Dr.' }],
  });

  patientUser = await createTestUser({
    fullName: 'Patient Silva',
    patientId: testPatient.id,
  });

  const card = await issueCard(testPatient.id, { actor: TEST_ACTOR });
  await prisma.accessGrant.create({
    data: {
      patientId: testPatient.id,
      facilityId: hospital.id,
      cardId: card.id,
      grantedByUserId: doctorUser.user.id,
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

function makeSampleBundle(healthId, reportId = 'rep-' + crypto.randomUUID().slice(0, 8), glucoseVal = 110) {
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
          resourceType: 'Observation',
          id: `obs-glu-${reportId}`,
          status: 'final',
          code: { text: 'Glucose' },
          valueQuantity: { value: glucoseVal, unit: 'mg/dL' },
        },
      },
      {
        resource: {
          resourceType: 'DiagnosticReport',
          id: reportId,
          status: 'final',
          code: { text: 'Fasting Blood Sugar' },
          result: [{ reference: `Observation/obs-glu-${reportId}` }],
        },
      },
    ],
  };
}

// ---------- 1. Server code never reads keys/ ----------

test('server code (src/) never reads or references the keys folder', () => {
  const srcDir = fileURLToPath(new URL('../src', import.meta.url));

  function scan(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.name.endsWith('.js')) {
        const content = readFileSync(fullPath, 'utf8');
        assert.ok(
          !content.includes('keys/'),
          `File ${fullPath} references "keys/". Server must never access private keys!`,
        );
      }
    }
  }

  scan(srcDir);
});

// ---------- 2. Upload signed record ----------

test('upload a valid facility-signed record: saved as version 1, verified, audited', async () => {
  const token = await loginAs(mltUserA);
  const bundle = makeSampleBundle(testPatient.healthId);
  const provenance = signBundle(bundle, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);

  const res = await request(app)
    .post('/api/records')
    .set(bearer(token))
    .send({ bundle, provenance });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.record.version, 1);
  assert.equal(res.body.record.lineageId, res.body.record.id);
  assert.equal(res.body.record.source, 'FACILITY_SIGNED');
  assert.equal(res.body.record.status, 'final');
  assert.equal(res.body.trust.status, TRUST.VERIFIED);
  assert.match(res.body.trust.reason, /Test Lab Alpha/);

  // Check audit log
  const audit = await prisma.auditLog.findFirst({
    where: { targetId: res.body.record.id, action: 'record.create' },
    orderBy: { at: 'desc' },
  });
  assert.ok(audit, 'Audit log row created');
  assert.equal(audit.patientId, testPatient.id);
  assert.equal(audit.facilityId, labFacilityA.id);
});

// ---------- 3. Duplicate upload rejected ----------

test('re-uploading the exact same bundle to the same facility is rejected with DUPLICATE_RECORD', async () => {
  const token = await loginAs(mltUserA);
  const bundle = makeSampleBundle(testPatient.healthId);
  const provenance = signBundle(bundle, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);

  const res1 = await request(app)
    .post('/api/records')
    .set(bearer(token))
    .send({ bundle, provenance });
  assert.equal(res1.status, 201);

  // Reorder keys to prove canonicalization catches it
  const reordered = JSON.parse(canonicalize(bundle));
  const res2 = await request(app)
    .post('/api/records')
    .set(bearer(token))
    .send({ bundle: reordered, provenance });

  assert.equal(res2.status, 409);
  assert.equal(res2.body.error.code, 'DUPLICATE_RECORD');
});

// ---------- 4. Tampered bundle rejected and audited ----------

test('upload with TAMPERED bundle data is rejected (400) and audited with reason TAMPERED', async () => {
  const token = await loginAs(mltUserA);
  const bundle = makeSampleBundle(testPatient.healthId);
  const provenance = signBundle(bundle, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);

  // Tamper with the glucose value after signing
  const tampered = structuredClone(bundle);
  tampered.entry[1].resource.valueQuantity.value = 999;

  const res = await request(app)
    .post('/api/records')
    .set(bearer(token))
    .send({ bundle: tampered, provenance });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'TAMPERED_RECORD');

  // Verify audit log recorded the rejected attempt
  const rejectedAudit = await prisma.auditLog.findFirst({
    where: { action: 'record.rejected', reason: 'TAMPERED', patientId: testPatient.id },
    orderBy: { at: 'desc' },
  });
  assert.ok(rejectedAudit, 'Rejection audited');
});

// ---------- 5. Unknown signer rejected and audited ----------

test('upload with UNKNOWN_SIGNER is rejected (400) and audited', async () => {
  const token = await loginAs(mltUserA);
  const bundle = makeSampleBundle(testPatient.healthId);
  // Sign with valid key but pretend to be an unregistered lab
  const provenance = signBundle(bundle, labKeyPairA.privateKeyPem, 'Organization/unregistered-lab');

  const res = await request(app)
    .post('/api/records')
    .set(bearer(token))
    .send({ bundle, provenance });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'UNKNOWN_SIGNER');

  const rejectedAudit = await prisma.auditLog.findFirst({
    where: { action: 'record.rejected', reason: 'UNKNOWN_SIGNER' },
    orderBy: { at: 'desc' },
  });
  assert.ok(rejectedAudit, 'Unknown signer rejection audited');
});

// ---------- 6. Facility mismatch rejected and audited ----------

test('upload with FACILITY_MISMATCH (uploader facility != signing facility) is rejected (403)', async () => {
  // MLT B (Lab B) uploads a report signed by Lab A
  const tokenB = await loginAs(mltUserB);
  const bundle = makeSampleBundle(testPatient.healthId);
  const provenance = signBundle(bundle, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);

  const res = await request(app)
    .post('/api/records')
    .set(bearer(tokenB))
    .send({ bundle, provenance });

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FACILITY_MISMATCH');

  const rejectedAudit = await prisma.auditLog.findFirst({
    where: { action: 'record.rejected', reason: 'FACILITY_MISMATCH' },
    orderBy: { at: 'desc' },
  });
  assert.ok(rejectedAudit, 'Facility mismatch audited');
});

// ---------- 7. Patient upload ----------

test('patient upload without signature is saved as PATIENT_UPLOADED (unverified)', async () => {
  const patientToken = await loginAs(patientUser, { asPatient: true });
  const bundle = makeSampleBundle(testPatient.healthId);

  const res = await request(app)
    .post('/api/records')
    .set(bearer(patientToken))
    .send({ bundle, provenance: null });

  assert.equal(res.status, 201);
  assert.equal(res.body.record.source, 'PATIENT_UPLOADED');
  assert.equal(res.body.record.facilityId, null);
  assert.equal(res.body.record.signingKeyFingerprint, null);
  assert.equal(res.body.trust.status, TRUST.PATIENT_UPLOADED);

  // Staff uploading without signature should fail
  const mltToken = await loginAs(mltUserA);
  const staffRes = await request(app)
    .post('/api/records')
    .set(bearer(mltToken))
    .send({ bundle: makeSampleBundle(testPatient.healthId), provenance: null });

  assert.equal(staffRes.status, 400);
  assert.equal(staffRes.body.error.code, 'SIGNATURE_REQUIRED');
});

// ---------- 8. Corrections and version lineage ----------

test('correcting a record: new version created, lineage preserved, both versions visible in history', async () => {
  const token = await loginAs(mltUserA);
  const reportId = 'rep-amend-' + crypto.randomUUID().slice(0, 8);
  const bundleV1 = makeSampleBundle(testPatient.healthId, reportId, 120);
  const provV1 = signBundle(bundleV1, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);

  const upload1 = await request(app)
    .post('/api/records')
    .set(bearer(token))
    .send({ bundle: bundleV1, provenance: provV1 });
  assert.equal(upload1.status, 201);
  const v1 = upload1.body.record;

  // Lab A creates an amended version
  const bundleV2 = structuredClone(bundleV1);
  bundleV2.entry[1].resource.valueQuantity.value = 125;
  bundleV2.entry[2].resource.status = 'amended';
  const provV2 = signBundle(bundleV2, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);

  const upload2 = await request(app)
    .post(`/api/records/${v1.id}/correct`)
    .set(bearer(token))
    .send({ bundle: bundleV2, provenance: provV2, status: 'amended' });

  assert.equal(upload2.status, 201, JSON.stringify(upload2.body));
  const v2 = upload2.body.record;

  assert.equal(v2.version, 2);
  assert.equal(v2.lineageId, v1.id);
  assert.equal(v2.previousVersionId, v1.id);
  assert.equal(v2.status, 'amended');

  // Fetch full history via GET /records/:id/history
  const histRes = await request(app)
    .get(`/api/records/${v2.id}/history`)
    .set(bearer(token));

  assert.equal(histRes.status, 200);
  assert.equal(histRes.body.versions.length, 2);
  assert.equal(histRes.body.versions[0].version, 1);
  assert.equal(histRes.body.versions[0].trust.status, TRUST.VERIFIED);
  assert.equal(histRes.body.versions[1].version, 2);
  assert.equal(histRes.body.versions[1].trust.status, TRUST.VERIFIED);
});

// ---------- 9. Branching corrections rejected ----------

test('correcting an already-corrected version is rejected with RECORD_ALREADY_AMENDED', async () => {
  const token = await loginAs(mltUserA);
  const reportId = 'rep-branch-' + crypto.randomUUID().slice(0, 8);
  const bundle = makeSampleBundle(testPatient.healthId, reportId, 100);
  const prov = signBundle(bundle, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);

  const res1 = await request(app)
    .post('/api/records')
    .set(bearer(token))
    .send({ bundle, provenance: prov });
  const v1 = res1.body.record;

  // First correction succeeds
  const bAmend1 = structuredClone(bundle);
  bAmend1.entry[1].resource.valueQuantity.value = 105;
  const pAmend1 = signBundle(bAmend1, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);
  const corr1 = await request(app)
    .post(`/api/records/${v1.id}/correct`)
    .set(bearer(token))
    .send({ bundle: bAmend1, provenance: pAmend1, status: 'amended' });
  assert.equal(corr1.status, 201);

  // Second correction of the same v1 must fail
  const bAmend2 = structuredClone(bundle);
  bAmend2.entry[1].resource.valueQuantity.value = 110;
  const pAmend2 = signBundle(bAmend2, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);
  const corr2 = await request(app)
    .post(`/api/records/${v1.id}/correct`)
    .set(bearer(token))
    .send({ bundle: bAmend2, provenance: pAmend2, status: 'amended' });

  assert.equal(corr2.status, 409);
  assert.equal(corr2.body.error.code, 'RECORD_ALREADY_AMENDED');
});

// ---------- 10. Another lab cannot correct records ----------

test('a lab cannot correct another lab’s records (FORBIDDEN)', async () => {
  const tokenA = await loginAs(mltUserA);
  const tokenB = await loginAs(mltUserB);

  const reportId = 'rep-other-' + crypto.randomUUID().slice(0, 8);
  const bundle = makeSampleBundle(testPatient.healthId, reportId);
  const provA = signBundle(bundle, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);

  const res = await request(app)
    .post('/api/records')
    .set(bearer(tokenA))
    .send({ bundle, provenance: provA });
  const v1 = res.body.record;

  // Lab B attempts to correct Lab A's record
  const provB = signBundle(bundle, labKeyPairB.privateKeyPem, `Organization/${labFacilityB.code}`);
  const corrRes = await request(app)
    .post(`/api/records/${v1.id}/correct`)
    .set(bearer(tokenB))
    .send({ bundle, provenance: provB, status: 'amended' });

  assert.equal(corrRes.status, 403);
  assert.equal(corrRes.body.error.code, 'FORBIDDEN');
});

// ---------- 11. Tampered database row shows as TAMPERED on read ----------

test('tampered row in database shows as TAMPERED on read', async () => {
  const token = await loginAs(mltUserA);
  const docToken = await loginAs(doctorUser);
  const bundle = makeSampleBundle(testPatient.healthId);
  const provenance = signBundle(bundle, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);

  const res = await request(app)
    .post('/api/records')
    .set(bearer(token))
    .send({ bundle, provenance });
  const recordId = res.body.record.id;

  // Verify initially OK
  const read1 = await request(app)
    .get(`/api/records/${recordId}`)
    .set(bearer(docToken));
  assert.equal(read1.body.trust.status, TRUST.VERIFIED);

  // Directly tamper with the database row bypassing triggers
  await prisma.$executeRawUnsafe(`ALTER TABLE "ClinicalRecord" DISABLE TRIGGER "ClinicalRecord_append_only"`);
  const tamperedBundle = structuredClone(bundle);
  tamperedBundle.entry[1].resource.valueQuantity.value = 999;
  await prisma.$executeRaw`
    UPDATE "ClinicalRecord"
    SET "bundle" = ${JSON.stringify(tamperedBundle)}::jsonb
    WHERE "id" = ${recordId}::uuid
  `;
  await prisma.$executeRawUnsafe(`ALTER TABLE "ClinicalRecord" ENABLE TRIGGER "ClinicalRecord_append_only"`);

  // Read back through API: verification fails and returns TAMPERED
  const read2 = await request(app)
    .get(`/api/records/${recordId}`)
    .set(bearer(docToken));
  assert.equal(read2.body.trust.status, TRUST.TAMPERED);
  assert.match(read2.body.trust.reason, /tampered in database/i);
});

// ---------- 12. Database triggers refuse changes on ClinicalRecord ----------

test('the database refuses UPDATE on ClinicalRecord (raw SQL and Prisma)', async () => {
  const isAppendOnly = (err) => /ClinicalRecord is append-only: (UPDATE|DELETE|TRUNCATE) is not allowed/.test(err.message);

  const mltActor = {
    userId: mltUserA.user.id,
    membershipId: mltUserA.memberships[0].id,
    facilityId: labFacilityA.id,
    role: 'LAB_STAFF',
    label: 'MLT Alpha',
  };
  const bundle = makeSampleBundle(testPatient.healthId);
  const provenance = signBundle(bundle, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);
  const { record } = await createRecord({ bundle, provenance }, { actor: mltActor });

  await assert.rejects(
    prisma.$executeRaw`UPDATE "ClinicalRecord" SET "mainResource" = 'tampered' WHERE "id" = ${record.id}::uuid`,
    isAppendOnly,
  );
  await assert.rejects(
    prisma.clinicalRecord.update({ where: { id: record.id }, data: { mainResource: 'tampered' } }),
    isAppendOnly,
  );
});

test('the database refuses DELETE and TRUNCATE on ClinicalRecord', async () => {
  const isAppendOnly = (err) => /ClinicalRecord is append-only: (UPDATE|DELETE|TRUNCATE) is not allowed/.test(err.message);

  const mltActor = {
    userId: mltUserA.user.id,
    membershipId: mltUserA.memberships[0].id,
    facilityId: labFacilityA.id,
    role: 'LAB_STAFF',
    label: 'MLT Alpha',
  };
  const bundle = makeSampleBundle(testPatient.healthId);
  const provenance = signBundle(bundle, labKeyPairA.privateKeyPem, `Organization/${labFacilityA.code}`);
  const { record } = await createRecord({ bundle, provenance }, { actor: mltActor });

  await assert.rejects(
    prisma.$executeRaw`DELETE FROM "ClinicalRecord" WHERE "id" = ${record.id}::uuid`,
    isAppendOnly,
  );
  await assert.rejects(
    prisma.clinicalRecord.delete({ where: { id: record.id } }),
    isAppendOnly,
  );
  await assert.rejects(
    prisma.$executeRaw`TRUNCATE TABLE "ClinicalRecord"`,
    isAppendOnly,
  );
});
