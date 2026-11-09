import './guard.js';
import test from 'node:test';
import assert from 'node:assert/strict';
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

// Helper to log in and get JWT token
async function loginAs(username, membershipId = null) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password: TEST_PASSWORD, membershipId });
  assert.equal(res.status, 200);
  return res.body.token;
}

// Helper to create an active card for a test patient
async function issueTestCard(patientId) {
  return prisma.card.create({
    data: {
      patientId,
      serial: `CARD-RX-${Math.random().toString(36).slice(2, 11).toUpperCase()}`,
      status: 'ACTIVE',
    },
  });
}

test('Phase 6: E-Prescription Creation requires Three Keys active AccessGrant', async () => {
  const hospital = await createTestFacility('HOSPITAL', 'Prescription Test Hospital');
  const { user: doctorUser, username: doctorUsername, memberships: [docMem] } = await createTestUser({
    memberships: [{ facility: hospital, role: 'DOCTOR', jobTitle: 'Consultant' }],
  });
  const doctorToken = await loginAs(doctorUsername, docMem.id);

  const patient = await createTestPatient({ givenName: 'Nimal', familyName: 'Silva' });
  const card = await issueTestCard(patient.id);

  // 1. Doctor without active AccessGrant: Prescription creation must be FORBIDDEN
  const blockedRes = await request(app)
    .post('/api/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      medicationCode: 'PARA-500',
      dosageInstruction: '1 tablet every 6 hours as needed',
      quantity: 20,
      daysSupply: 5,
    });

  assert.equal(blockedRes.status, 403);
  assert.equal(blockedRes.body.error?.code, 'NO_ACTIVE_GRANT');

  // 2. Doctor scans patient card -> creates 90-day AccessGrant
  const scanRes = await request(app)
    .post('/api/access/scan')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ healthId: patient.healthId, cardSerial: card.serial });
  assert.equal(scanRes.status, 201);

  // 3. Doctor now successfully issues Prescription
  const rxRes = await request(app)
    .post('/api/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      medicationCode: 'PARA-500',
      dosageInstruction: '1 tablet every 6 hours as needed',
      quantity: 20,
      daysSupply: 5,
    });

  assert.equal(rxRes.status, 201);
  assert.ok(rxRes.body.prescription.prescriptionCode.startsWith('DEMO-RX-'));
  assert.equal(rxRes.body.prescription.dispenseState, 'PENDING');
  assert.equal(rxRes.body.prescription.fhir.resourceType, 'MedicationRequest');
});

test('Phase 6: DDI & Duplicate Therapy Safety Engine blocks high-risk pairs without override', async () => {
  const hospital = await createTestFacility('HOSPITAL', 'Safety Engine Hospital');
  const pharmacy = await createTestFacility('PHARMACY', 'Safety Engine Pharmacy');

  const { user: doctorUser, username: doctorUsername, memberships: [docMem] } = await createTestUser({
    memberships: [{ facility: hospital, role: 'DOCTOR' }],
  });
  const doctorToken = await loginAs(doctorUsername, docMem.id);

  const { user: pharmUser, username: pharmUsername, memberships: [pharmMem] } = await createTestUser({
    memberships: [{ facility: pharmacy, role: 'PHARMACIST' }],
  });
  const pharmToken = await loginAs(pharmUsername, pharmMem.id);

  const patient = await createTestPatient({ givenName: 'Kamal', familyName: 'Perera' });
  const card = await issueTestCard(patient.id);

  // Grant clinical access via card scan
  const scanRes = await request(app)
    .post('/api/access/scan')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ healthId: patient.healthId, cardSerial: card.serial });
  assert.equal(scanRes.status, 201);

  // 1. Prescribe and dispense active NSAID (Ibuprofen)
  const ibuRes = await request(app)
    .post('/api/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      medicationCode: 'IBU-400',
      dosageInstruction: '400mg three times daily after meals',
      quantity: 30,
      daysSupply: 10,
    });
  assert.equal(ibuRes.status, 201);

  // Pharmacy dispenses Ibuprofen so it is actively circulating
  const ibuCode = ibuRes.body.prescription.prescriptionCode;
  const dispRes = await request(app)
    .post(`/api/prescriptions/scan/${ibuCode}/dispense`)
    .set('Authorization', `Bearer ${pharmToken}`)
    .send({ quantityDispensed: 30, daysSupply: 10 });
  assert.equal(dispRes.status, 200);

  // 2. Doctor attempts to prescribe Warfarin (Anticoagulant) -> Critical Bleeding Hazard
  const warfBlocked = await request(app)
    .post('/api/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      medicationCode: 'WARF-5',
      dosageInstruction: '5mg once daily at night',
      quantity: 30,
      daysSupply: 30,
    });

  assert.equal(warfBlocked.status, 422);
  assert.equal(warfBlocked.body.error?.code, 'SAFETY_WARNING');
  const ddiWarning = warfBlocked.body.error.details.warnings.find(
    (w) => w.type === 'DRUG_DRUG_INTERACTION'
  );
  assert.ok(ddiWarning, 'Must identify critical DDI hazard');
  assert.equal(ddiWarning.severity, 'CRITICAL');

  // 3. Doctor attempts to prescribe Diclofenac -> Duplicate NSAID Class Hazard
  const dicloBlocked = await request(app)
    .post('/api/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      medicationCode: 'DICLO-50',
      dosageInstruction: '50mg twice daily',
      quantity: 20,
      daysSupply: 10,
    });

  assert.equal(dicloBlocked.status, 422);
  const dupWarning = dicloBlocked.body.error.details.warnings.find(
    (w) => w.type === 'DUPLICATE_CLASS'
  );
  assert.ok(dupWarning, 'Must detect duplicate NSAID therapeutic class');

  // 4. Doctor overrides critical DDI with clinical justification string
  const warfAllowed = await request(app)
    .post('/api/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      medicationCode: 'WARF-5',
      dosageInstruction: '5mg once daily at night',
      quantity: 30,
      daysSupply: 30,
      overrideReason: 'Patient instructed to discontinue Ibuprofen immediately; co-prescribing PPI and monitoring INR.',
    });

  assert.equal(warfAllowed.status, 201);
  assert.equal(warfAllowed.body.overridden, true);
  assert.ok(warfAllowed.body.prescription.overrideReason.includes('discontinue Ibuprofen'));
});

test('Phase 6: Allergy Contraindication blocks prescribing unless overridden', async () => {
  const hospital = await createTestFacility('HOSPITAL', 'Allergy Hospital');
  const { user: doctorUser, username: doctorUsername, memberships: [docMem] } = await createTestUser({
    memberships: [{ facility: hospital, role: 'DOCTOR' }],
  });
  const doctorToken = await loginAs(doctorUsername, docMem.id);

  const patient = await createTestPatient({ givenName: 'Anula', familyName: 'Fernando' });
  const card = await issueTestCard(patient.id);

  await request(app)
    .post('/api/access/scan')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ healthId: patient.healthId, cardSerial: card.serial });

  // 1. Record Penicillin allergy
  const allergyRes = await request(app)
    .post(`/api/patients/${patient.healthId}/allergies`)
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      substance: 'PENICILLIN',
      severity: 'SEVERE',
      reaction: 'Anaphylaxis and facial edema',
    });
  assert.equal(allergyRes.status, 201);
  assert.equal(allergyRes.body.allergy.substance, 'PENICILLIN');

  // 2. Doctor attempts to prescribe Amoxicillin (Penicillin class) -> Blocked
  const amoxBlocked = await request(app)
    .post('/api/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      medicationCode: 'AMOX-500',
      dosageInstruction: '500mg 3 times daily for 7 days',
      quantity: 21,
      daysSupply: 7,
    });

  assert.equal(amoxBlocked.status, 422);
  const allergyWarning = amoxBlocked.body.error.details.warnings.find(
    (w) => w.type === 'ALLERGY_CONTRAINDICATION'
  );
  assert.ok(allergyWarning, 'Must identify allergy contraindication');
  assert.equal(allergyWarning.severity, 'CRITICAL');

  // 3. Override with clinical reason
  const amoxOverridden = await request(app)
    .post('/api/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      medicationCode: 'AMOX-500',
      dosageInstruction: '500mg 3 times daily',
      quantity: 21,
      daysSupply: 7,
      overrideReason: 'Desensitization protocol in ICU setting under continuous anaphylaxis monitoring.',
    });
  assert.equal(amoxOverridden.status, 201);
  assert.equal(amoxOverridden.body.overridden, true);
});

test('Phase 6: Scoped Pharmacy Access, Dispense Lifecycle & Re-use Prevention (409 Conflict)', async () => {
  const hospital = await createTestFacility('HOSPITAL', 'Dispense Test Hospital');
  const pharmacy = await createTestFacility('PHARMACY', 'Dispense Test Pharmacy');
  const lab = await createTestFacility('LAB', 'Dispense Test Lab');

  const { user: doctorUser, username: doctorUsername, memberships: [docMem] } = await createTestUser({
    memberships: [{ facility: hospital, role: 'DOCTOR' }],
  });
  const doctorToken = await loginAs(doctorUsername, docMem.id);

  const { user: pharmUser, username: pharmUsername, memberships: [pharmMem] } = await createTestUser({
    memberships: [{ facility: pharmacy, role: 'PHARMACIST' }],
  });
  const pharmToken = await loginAs(pharmUsername, pharmMem.id);

  const { user: labUser, username: labUsername, memberships: [labMem] } = await createTestUser({
    memberships: [{ facility: lab, role: 'LAB_STAFF' }],
  });
  const labToken = await loginAs(labUsername, labMem.id);

  const patient = await createTestPatient({ givenName: 'Sunil', familyName: 'Jayakody' });
  const card = await issueTestCard(patient.id);

  await request(app)
    .post('/api/access/scan')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ healthId: patient.healthId, cardSerial: card.serial });

  // 1. Doctor creates prescription with 0 repeats (single dispense only)
  const rxRes = await request(app)
    .post('/api/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      medicationCode: 'CIPRO-500',
      dosageInstruction: '500mg twice daily for 5 days',
      quantity: 10,
      daysSupply: 5,
      repeatsAllowed: 0,
    });
  assert.equal(rxRes.status, 201);
  const rxCode = rxRes.body.prescription.prescriptionCode;

  // 2. Scoped QR Scan: Pharmacist can scan and see ONLY the prescription payload
  const scanRes = await request(app)
    .get(`/api/prescriptions/scan/${rxCode}`)
    .set('Authorization', `Bearer ${pharmToken}`);

  assert.equal(scanRes.status, 200);
  assert.equal(scanRes.body.prescription.prescriptionCode, rxCode);
  assert.equal(scanRes.body.prescription.medicationCode, 'CIPRO-500');
  assert.equal(scanRes.body.patient.healthId, patient.healthId);
  // Crucial check: Pharmacist does NOT get full clinical history in this scan response
  assert.equal(scanRes.body.records, undefined);

  // 3. Non-pharmacist (LAB_STAFF) cannot scan prescription
  const labScan = await request(app)
    .get(`/api/prescriptions/scan/${rxCode}`)
    .set('Authorization', `Bearer ${labToken}`);
  assert.equal(labScan.status, 403);

  // 4. Pharmacist CANNOT access patient full medical record
  const fullRecForbidden = await request(app)
    .get(`/api/patients/${patient.healthId}`)
    .set('Authorization', `Bearer ${pharmToken}`);
  assert.equal(fullRecForbidden.status, 403);

  // 5. First Dispense: Succeeds, transitions prescription to DISPENSED
  const dispense1 = await request(app)
    .post(`/api/prescriptions/scan/${rxCode}/dispense`)
    .set('Authorization', `Bearer ${pharmToken}`)
    .send({ quantityDispensed: 10, daysSupply: 5, notes: 'Dispensed original pack' });

  assert.equal(dispense1.status, 200);
  assert.equal(dispense1.body.prescription.dispenseState, 'DISPENSED');
  assert.equal(dispense1.body.prescription.repeatsRemaining, 0);
  assert.equal(dispense1.body.dispense.fhir.resourceType, 'MedicationDispense');

  // 6. Duplicate Dispense Prevention: Attempting to dispense again must be REJECTED with 409 Conflict
  const dispense2 = await request(app)
    .post(`/api/prescriptions/scan/${rxCode}/dispense`)
    .set('Authorization', `Bearer ${pharmToken}`)
    .send({ quantityDispensed: 10, daysSupply: 5 });

  assert.equal(dispense2.status, 409);
  assert.equal(dispense2.body.error?.code, 'PRESCRIPTION_ALREADY_DISPENSED');
});

test('Phase 6: Prescription with Refills (repeatsAllowed) manages partial and full dispense states', async () => {
  const hospital = await createTestFacility('HOSPITAL', 'Refills Test Hospital');
  const pharmacy = await createTestFacility('PHARMACY', 'Refills Test Pharmacy');

  const { user: doctorUser, username: doctorUsername, memberships: [docMem] } = await createTestUser({
    memberships: [{ facility: hospital, role: 'DOCTOR' }],
  });
  const doctorToken = await loginAs(doctorUsername, docMem.id);

  const { user: pharmUser, username: pharmUsername, memberships: [pharmMem] } = await createTestUser({
    memberships: [{ facility: pharmacy, role: 'PHARMACIST' }],
  });
  const pharmToken = await loginAs(pharmUsername, pharmMem.id);

  const patient = await createTestPatient({ givenName: 'Champa', familyName: 'Kulathunga' });
  const card = await issueTestCard(patient.id);

  await request(app)
    .post('/api/access/scan')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ healthId: patient.healthId, cardSerial: card.serial });

  // 1. Doctor creates prescription with 1 repeat allowed (1 original + 1 refill)
  const rxRes = await request(app)
    .post('/api/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      medicationCode: 'METO-50',
      dosageInstruction: '50mg once daily in morning',
      quantity: 30,
      daysSupply: 30,
      repeatsAllowed: 1,
    });
  assert.equal(rxRes.status, 201);
  const rxCode = rxRes.body.prescription.prescriptionCode;
  assert.equal(rxRes.body.prescription.repeatsRemaining, 1);

  // 2. First Dispense: Consumes initial fill, 1 refill remains, state is PARTIALLY_DISPENSED
  const fill1 = await request(app)
    .post(`/api/prescriptions/scan/${rxCode}/dispense`)
    .set('Authorization', `Bearer ${pharmToken}`)
    .send({ quantityDispensed: 30, daysSupply: 30 });

  assert.equal(fill1.status, 200);
  assert.equal(fill1.body.prescription.dispenseState, 'PARTIALLY_DISPENSED');
  assert.equal(fill1.body.prescription.repeatsRemaining, 1);

  // 3. Second Dispense (Refill): Consumes final repeat, transitions to DISPENSED
  const fill2 = await request(app)
    .post(`/api/prescriptions/scan/${rxCode}/dispense`)
    .set('Authorization', `Bearer ${pharmToken}`)
    .send({ quantityDispensed: 30, daysSupply: 30 });

  assert.equal(fill2.status, 200);
  assert.equal(fill2.body.prescription.dispenseState, 'DISPENSED');
  assert.equal(fill2.body.prescription.repeatsRemaining, 0);

  // 4. Third Dispense: Rejected with 409 Conflict
  const fill3 = await request(app)
    .post(`/api/prescriptions/scan/${rxCode}/dispense`)
    .set('Authorization', `Bearer ${pharmToken}`)
    .send({ quantityDispensed: 30, daysSupply: 30 });

  assert.equal(fill3.status, 409);
  assert.equal(fill3.body.error?.code, 'PRESCRIPTION_ALREADY_DISPENSED');
});

test('Phase 6: Auto Medication List Engine and Emergency Summary dynamic population', async () => {
  const hospital = await createTestFacility('HOSPITAL', 'MedList Hospital');
  const pharmacy = await createTestFacility('PHARMACY', 'MedList Pharmacy');

  const { user: doctorUser, username: doctorUsername, memberships: [docMem] } = await createTestUser({
    memberships: [{ facility: hospital, role: 'DOCTOR' }],
  });
  const doctorToken = await loginAs(doctorUsername, docMem.id);

  const { user: pharmUser, username: pharmUsername, memberships: [pharmMem] } = await createTestUser({
    memberships: [{ facility: pharmacy, role: 'PHARMACIST' }],
  });
  const pharmToken = await loginAs(pharmUsername, pharmMem.id);

  const patient = await createTestPatient({ givenName: 'Malkanthi', familyName: 'Dias' });
  const card = await issueTestCard(patient.id);

  await request(app)
    .post('/api/access/scan')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ healthId: patient.healthId, cardSerial: card.serial });

  // Record allergy
  await request(app)
    .post(`/api/patients/${patient.healthId}/allergies`)
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ substance: 'SULFONAMIDE', severity: 'MODERATE', reaction: 'Skin rash' });

  // Issue Atorvastatin
  const atorRx = await request(app)
    .post('/api/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      medicationCode: 'ATOR-20',
      dosageInstruction: '20mg at bedtime',
      quantity: 30,
      daysSupply: 30,
    });
  assert.equal(atorRx.status, 201);

  // Pharmacy dispenses Atorvastatin
  await request(app)
    .post(`/api/prescriptions/scan/${atorRx.body.prescription.prescriptionCode}/dispense`)
    .set('Authorization', `Bearer ${pharmToken}`)
    .send({ quantityDispensed: 30, daysSupply: 30 });

  // Issue Metoprolol (pending dispense)
  await request(app)
    .post('/api/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({
      patientHealthId: patient.healthId,
      medicationCode: 'METO-50',
      dosageInstruction: '50mg daily',
      quantity: 14,
      daysSupply: 14,
    });

  // 1. Check Auto Medication List
  const medListRes = await request(app)
    .get(`/api/patients/${patient.healthId}/medications`)
    .set('Authorization', `Bearer ${doctorToken}`);

  assert.equal(medListRes.status, 200);
  assert.equal(medListRes.body.activeMedications.length, 1);
  assert.equal(medListRes.body.activeMedications[0].medicationCode, 'ATOR-20');
  assert.equal(medListRes.body.pendingPrescriptions.length, 1);
  assert.equal(medListRes.body.pendingPrescriptions[0].medicationCode, 'METO-50');

  // 2. Check Emergency Summary endpoint: Now dynamically populated!
  const emergRes = await request(app)
    .get(`/api/patients/${patient.healthId}/emergency`)
    .set('Authorization', `Bearer ${doctorToken}`);

  assert.equal(emergRes.status, 200);
  assert.equal(emergRes.body.emergencySummary.allergies.length, 1);
  assert.equal(emergRes.body.emergencySummary.allergies[0].substance, 'SULFONAMIDE');
  assert.equal(emergRes.body.emergencySummary.currentMedications.length, 1);
  assert.equal(emergRes.body.emergencySummary.currentMedications[0].medicationCode, 'ATOR-20');
});
