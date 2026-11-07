// Phase 4: Lab client simulation (DESIGN.md section 4).
// The facility signs before sending: holds the lab's private key, signs a FHIR bundle,
// and uploads { bundle, provenance }. The server only VERIFIES using the facility's
// public key from the database.
// Run: node --env-file=../.env scripts/lab-client.js

import fs from 'node:fs';
import { signBundle } from '../src/core/sign.js';
import { app } from '../src/app.js';
import request from 'supertest';

const PRIVATE_KEY_PATH = 'keys/demo-lab-colombo.private.pem';
const LAB_REF = 'Organization/demo-lab-colombo';
const USERNAME = 'mlt.silva';
const SEED_PASSWORD = process.env.SEED_PASSWORD;
const TARGET_HEALTH_ID = 'DEMO-100001-7'; // Adult seed patient (Kumari)

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error('No lab key found at ' + PRIVATE_KEY_PATH + '. Run: npm run keys');
  process.exit(1);
}

if (!SEED_PASSWORD) {
  console.error('SEED_PASSWORD not found in environment (.env).');
  process.exit(1);
}

const privateKeyPem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
const sampleReport = JSON.parse(fs.readFileSync('data/sample-report.json', 'utf8'));

// Update patient reference and Health ID in the sample report to target our seed patient
const bundle = structuredClone(sampleReport);
const patientEntry = bundle.entry.find((e) => e.resource.resourceType === 'Patient');
if (patientEntry) {
  patientEntry.resource.identifier = [
    { system: 'urn:doc365:demo-phn', value: TARGET_HEALTH_ID },
  ];
  patientEntry.resource.name = [{ family: 'Jayasinghe', given: ['Kumari'] }];
}

console.log('=== Doc365 Phase 4: Lab Client (Demo Lab Colombo) ===');
console.log(`Target patient: ${TARGET_HEALTH_ID}`);

// 1. Lab signs the report BEFORE sending
console.log('\n[1] Signing FHIR bundle with lab private key...');
const provenance = signBundle(bundle, privateKeyPem, LAB_REF);
console.log(`    Provenance target: ${provenance.target[0].reference}`);
console.log(`    Signer reference:  ${provenance.signature[0].who.reference}`);
console.log(`    Signature (trunc): ${provenance.signature[0].data.slice(0, 32)}...`);

// 2. Log in as mlt.silva to obtain JWT
console.log(`\n[2] Logging in as ${USERNAME}...`);
const loginRes = await request(app)
  .post('/api/auth/login')
  .send({ username: USERNAME, password: SEED_PASSWORD });

if (loginRes.status !== 200) {
  console.error('Login failed:', loginRes.body);
  process.exit(1);
}

const token = loginRes.body.token;
console.log('    Login successful. Received 15-minute JWT.');

// 3. Upload the signed record to the server
console.log('\n[3] Uploading { bundle, provenance } to POST /api/records...');
const uploadRes = await request(app)
  .post('/api/records')
  .set('Authorization', `Bearer ${token}`)
  .send({ bundle, provenance });

if (uploadRes.status === 201) {
  console.log('    Upload accepted!');
  console.log(`    Record ID:  ${uploadRes.body.record.id}`);
  console.log(`    Lineage ID: ${uploadRes.body.record.lineageId}`);
  console.log(`    Version:    ${uploadRes.body.record.version}`);
  console.log(`    Status:     ${uploadRes.body.record.status}`);
  console.log(`    Trust:      ${uploadRes.body.trust.status} (${uploadRes.body.trust.reason})`);
} else if (uploadRes.status === 409 && uploadRes.body.error?.code === 'DUPLICATE_RECORD') {
  console.log('    Record already exists (idempotent hash check prevented duplicate upload).');
} else {
  console.error(`    Upload failed with status ${uploadRes.status}:`, uploadRes.body);
  process.exit(1);
}

console.log('\nLab client completed successfully.');
process.exit(0);
