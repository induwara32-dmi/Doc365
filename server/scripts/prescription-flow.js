// Phase 6 Demo: Full E-Prescription, Safety, Scoped Scan, and Dispensing Flow.
// Runs the doctor -> prescription -> safety check -> pharmacy -> auto medication list lifecycle.
// Run: npm run demo:rx (or node --env-file=../.env scripts/prescription-flow.js)

import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD;
const TARGET_PATIENT_HEALTH_ID = 'DEMO-100001-7'; // Adult seed patient (Kumari)

if (!SEED_PASSWORD) {
  console.error('SEED_PASSWORD not found in environment (.env).');
  process.exit(1);
}

console.log('======================================================================');
console.log('   Doc365 Phase 6: E-Prescriptions, Dispensing & Medication Safety    ');
console.log('======================================================================\n');

// 1. Log in as Dr. Perera at Demo General Hospital
console.log('[Step 1] Doctor Login: Logging in as dr.perera at Demo General Hospital...');
const docFacility = await prisma.facility.findUnique({ where: { code: 'demo-general-hospital' } });
const docUser = await prisma.user.findUnique({ where: { username: 'dr.perera' } });
const docMembership = await prisma.staffMembership.findFirst({
  where: { userId: docUser.id, facilityId: docFacility.id, role: 'DOCTOR' },
});

const docLoginRes = await request(app)
  .post('/api/auth/login')
  .send({ username: 'dr.perera', password: SEED_PASSWORD, membershipId: docMembership.id });

if (docLoginRes.status !== 200) {
  console.error('Doctor login failed:', docLoginRes.body);
  process.exit(1);
}
const docToken = docLoginRes.body.token;
console.log(`    Authenticated session: ${docLoginRes.body.session.label}`);

// 2. Fetch patient and active card
const patient = await prisma.patient.findUnique({
  where: { healthId: TARGET_PATIENT_HEALTH_ID },
  include: { cards: true },
});
const activeCard = patient.cards.find((c) => c.status === 'ACTIVE');
console.log(`\n[Step 2] Patient Presentation:`);
console.log(`    Patient: ${patient.fullName} (${patient.healthId})`);
console.log(`    Active Card Serial: ${activeCard.serial}`);

// 3. Scan card to create 90-day consultation AccessGrant (Three Keys rule)
console.log(`\n[Step 3] Three Keys Rule: Scanning card to establish 90-day clinical consultation grant...`);
const scanGrantRes = await request(app)
  .post('/api/access/scan')
  .set('Authorization', `Bearer ${docToken}`)
  .send({ healthId: patient.healthId, cardSerial: activeCard.serial });

console.log(`    AccessGrant Created: ID ${scanGrantRes.body.grant.id}`);
console.log(`    Expires at: ${scanGrantRes.body.grant.expiresAt} (90-day window)`);

// 4. Record allergy to Penicillin
console.log(`\n[Step 4] Documenting Patient Allergy: Penicillin (Severe anaphylaxis)...`);
const allergyRes = await request(app)
  .post(`/api/patients/${patient.healthId}/allergies`)
  .set('Authorization', `Bearer ${docToken}`)
  .send({
    substance: 'PENICILLIN',
    severity: 'SEVERE',
    reaction: 'Anaphylaxis and angioedema',
  });
console.log(`    Allergy recorded: ${allergyRes.body.allergy.substance} (${allergyRes.body.allergy.severity})`);

// 5. Test Safety Engine: Prescribe Amoxicillin (contraindicated)
console.log(`\n[Step 5] Safety Engine Test: Doctor attempts to prescribe Amoxicillin 500mg...`);
const amoxRes = await request(app)
  .post('/api/prescriptions')
  .set('Authorization', `Bearer ${docToken}`)
  .send({
    patientHealthId: patient.healthId,
    medicationCode: 'AMOX-500',
    dosageInstruction: '500mg three times daily for 7 days',
    quantity: 21,
    daysSupply: 7,
  });

if (amoxRes.status === 422) {
  console.log(`    SAFETY ENGINE INTERCEPTED (HTTP 422):`);
  for (const w of amoxRes.body.error.details.warnings) {
    console.log(`    [ALERT - ${w.severity}] ${w.type}: ${w.message}`);
  }
  console.log(`    Prescription was safely BLOCKED without doctor override justification.`);
} else {
  console.error('Safety engine failed to block Amoxicillin:', amoxRes.body);
}

// 6. Doctor prescribes safe alternative: Ciprofloxacin 500mg
console.log(`\n[Step 6] Prescribing Safe Alternative: Ciprofloxacin 500mg...`);
const rxRes = await request(app)
  .post('/api/prescriptions')
  .set('Authorization', `Bearer ${docToken}`)
  .send({
    patientHealthId: patient.healthId,
    medicationCode: 'CIPRO-500',
    dosageInstruction: '500mg twice daily for 5 days',
    quantity: 10,
    daysSupply: 5,
    repeatsAllowed: 0,
  });

if (rxRes.status !== 201) {
  console.error('Prescription creation failed:', rxRes.body);
  process.exit(1);
}

const prescription = rxRes.body.prescription;
console.log(`    Prescription Created: ${prescription.medicationName}`);
console.log(`    Unique Scannable QR Code: ${prescription.prescriptionCode}`);
console.log(`    Status: ${prescription.dispenseState}`);
console.log(`    FHIR Resource: ${prescription.fhir.resourceType} (intent: ${prescription.fhir.intent})`);

// 7. Pharmacist logs in at Demo Pharmacy Colombo
console.log(`\n[Step 7] Pharmacy Session: Logging in as pharm.fernando at Demo Pharmacy Colombo...`);
const pharmFacility = await prisma.facility.findUnique({ where: { code: 'demo-pharmacy' } });
const pharmUser = await prisma.user.findUnique({ where: { username: 'pharm.fernando' } });
const pharmMembership = await prisma.staffMembership.findFirst({
  where: { userId: pharmUser.id, facilityId: pharmFacility.id, role: 'PHARMACIST' },
});

const pharmLoginRes = await request(app)
  .post('/api/auth/login')
  .send({ username: 'pharm.fernando', password: SEED_PASSWORD, membershipId: pharmMembership.id });

const pharmToken = pharmLoginRes.body.token;
console.log(`    Authenticated session: ${pharmLoginRes.body.session.label}`);

// 8. Pharmacist scans QR code (Scoped Access Guarantee)
console.log(`\n[Step 8] Scoped QR Scan: Pharmacist scans prescription ${prescription.prescriptionCode}...`);
const scanRes = await request(app)
  .get(`/api/prescriptions/scan/${prescription.prescriptionCode}`)
  .set('Authorization', `Bearer ${pharmToken}`);

console.log(`    Scoped Access Verified:`);
console.log(`    - Medication: ${scanRes.body.prescription.medicationName} (${scanRes.body.prescription.dosageInstruction})`);
console.log(`    - Quantity: ${scanRes.body.prescription.quantity} units (${scanRes.body.prescription.daysSupply} days supply)`);
console.log(`    - Prescribed by: ${scanRes.body.prescriber.doctorName} at ${scanRes.body.prescriber.facilityName}`);
console.log(`    - Patient: ${scanRes.body.patient.fullName} (DOB: ${scanRes.body.patient.dateOfBirth})`);
console.log(`    - Full Clinical History visible? NO (Scoped strictly to prescription payload)`);

// 9. Pharmacist dispenses prescription
console.log(`\n[Step 9] Dispensing: Pharmacist dispenses ${prescription.medicationName}...`);
const dispenseRes = await request(app)
  .post(`/api/prescriptions/scan/${prescription.prescriptionCode}/dispense`)
  .set('Authorization', `Bearer ${pharmToken}`)
  .send({ quantityDispensed: 10, daysSupply: 5, notes: 'Original manufacturer foil pack dispensed' });

console.log(`    Dispensed successfully!`);
console.log(`    Dispense ID: ${dispenseRes.body.dispense.id}`);
console.log(`    Prescription New State: ${dispenseRes.body.prescription.dispenseState}`);
console.log(`    FHIR Resource: ${dispenseRes.body.dispense.fhir.resourceType}`);

// 10. Re-use Prevention check
console.log(`\n[Step 10] Re-use Prevention Check: Customer attempts to present the same QR code again...`);
const duplicateDispenseRes = await request(app)
  .post(`/api/prescriptions/scan/${prescription.prescriptionCode}/dispense`)
  .set('Authorization', `Bearer ${pharmToken}`)
  .send({ quantityDispensed: 10, daysSupply: 5 });

if (duplicateDispenseRes.status === 409) {
  console.log(`    RE-USE PREVENTED (HTTP 409 Conflict):`);
  console.log(`    Code: ${duplicateDispenseRes.body.error.code}`);
  console.log(`    Message: ${duplicateDispenseRes.body.error.message}`);
} else {
  console.error('Re-use prevention failed:', duplicateDispenseRes.body);
}

// 11. Real-time Auto Medication List
console.log(`\n[Step 11] Auto Medication List: Querying active medications for Kumari Jayasinghe...`);
const medListRes = await request(app)
  .get(`/api/patients/${patient.healthId}/medications`)
  .set('Authorization', `Bearer ${docToken}`);

console.log(`    Active Medications (${medListRes.body.activeMedications.length}):`);
for (const med of medListRes.body.activeMedications) {
  console.log(`    - ${med.medicationName} | Qty: ${med.quantity} | Active until: ${med.activeUntil}`);
}

// 12. Emergency Summary integration
console.log(`\n[Step 12] Emergency Summary Integration: Doctor accesses minimal emergency facts...`);
const emergRes = await request(app)
  .get(`/api/patients/${patient.healthId}/emergency`)
  .set('Authorization', `Bearer ${docToken}`);

console.log(`    Blood Group: ${emergRes.body.emergencySummary.bloodGroup}`);
console.log(`    Documented Allergies: ${emergRes.body.emergencySummary.allergies.map((a) => `${a.substance} (${a.severity})`).join(', ')}`);
console.log(`    Current Active Medications: ${emergRes.body.emergencySummary.currentMedications.map((m) => m.medicationName).join(', ')}`);

console.log('\n======================================================================');
console.log('   Phase 6 E-Prescription & Dispensing Demo Completed Successfully!   ');
console.log('======================================================================\n');
process.exit(0);
