import './guard.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';
import { createTestFacility } from './helpers.js';
import { isValidHealthId } from '../src/patients/health-id.js';

test('Phase 8: Patient Self-Registration creates User, Patient with Luhn ID, and active Health Card', async () => {
  const username = `pat.${Date.now()}`;
  const res = await request(app)
    .post('/api/auth/register/patient')
    .send({
      username,
      password: 'password-strong-123',
      givenName: 'Nayana',
      familyName: 'Kumari',
      fullName: 'Nayana Kumari Dissanayake',
      dateOfBirth: '1995-04-12',
      sex: 'female',
      nic: `DEMO-NIC-${Date.now().toString().slice(-9)}V`,
    });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.token);
  assert.equal(res.body.session.role, 'PATIENT');
  assert.equal(res.body.session.fullName, 'Nayana Kumari Dissanayake');
  assert.ok(res.body.patient.healthId.startsWith('DEMO-'));
  assert.ok(isValidHealthId(res.body.patient.healthId));
  assert.ok(res.body.card.serial.startsWith('CARD-'));
  assert.equal(res.body.card.status, 'ACTIVE');

  // Duplicate username check
  const dupRes = await request(app)
    .post('/api/auth/register/patient')
    .send({
      username,
      password: 'password-strong-123',
      familyName: 'Other',
      dateOfBirth: '1992-01-01',
      sex: 'male',
    });
  assert.equal(dupRes.status, 409);
  assert.equal(dupRes.body.error?.code, 'USERNAME_TAKEN');
});

test('Phase 8: Doctor Registration verifies SLMC number and joins hospital facility', async () => {
  const hospital = await createTestFacility('HOSPITAL', 'Colombo North Teaching Hospital');
  const slmcNumber = `SLMC-${Math.floor(10000 + Math.random() * 90000)}`;
  const username = `doc.${Date.now()}`;

  const res = await request(app)
    .post('/api/auth/register/doctor')
    .send({
      username,
      password: 'password-strong-123',
      fullName: 'Dr. Aruna Bandara',
      slmcNumber,
      specialization: 'Cardiology',
      facilityId: hospital.id,
      jobTitle: 'Consultant Cardiologist',
    });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.token);
  assert.equal(res.body.session.role, 'DOCTOR');
  assert.equal(res.body.session.fullName, 'Dr. Aruna Bandara');
  assert.equal(res.body.session.slmcNumber, slmcNumber);
  assert.equal(res.body.session.specialization, 'Cardiology');
  assert.equal(res.body.session.facilityId, hospital.id);

  // Duplicate SLMC number rejection
  const dupSlmcRes = await request(app)
    .post('/api/auth/register/doctor')
    .send({
      username: `doc2.${Date.now()}`,
      password: 'password-strong-123',
      fullName: 'Dr. Another Person',
      slmcNumber,
      facilityId: hospital.id,
    });
  assert.equal(dupSlmcRes.status, 409);
  assert.equal(dupSlmcRes.body.error?.code, 'SLMC_ALREADY_REGISTERED');
});

test('Phase 8: Pharmacy Registration creates Pharmacy facility and Pharmacist membership', async () => {
  const rand = Math.floor(1000 + Math.random() * 9000);
  const pharmacyCode = `pharm-test-${rand}`;
  const nmraLicense = `NMRA-PH-${rand}`;
  const username = `pharm.${Date.now()}`;

  const res = await request(app)
    .post('/api/auth/register/pharmacy')
    .send({
      pharmacyName: 'Lanka Health Pharmacy Galle',
      pharmacyCode,
      nmraLicense,
      username,
      password: 'password-strong-123',
      fullName: 'Sunimal Fernando',
      jobTitle: 'Chief Pharmacist',
    });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.token);
  assert.equal(res.body.session.role, 'PHARMACIST');
  assert.equal(res.body.session.facilityCode, pharmacyCode);
  assert.equal(res.body.session.licenseNumber, nmraLicense);
  assert.equal(res.body.facility.type, 'PHARMACY');
});

test('Phase 8: Laboratory Registration creates Lab facility and MLT membership', async () => {
  const rand = Math.floor(1000 + Math.random() * 9000);
  const labCode = `lab-test-${rand}`;
  const phsrcRegNo = `PHSRC-LAB-${rand}`;
  const username = `mlt.${Date.now()}`;

  const res = await request(app)
    .post('/api/auth/register/lab')
    .send({
      labName: 'Southern Diagnostics Lab Matara',
      labCode,
      phsrcRegNo,
      username,
      password: 'password-strong-123',
      fullName: 'Chathurika Jayawardena',
      jobTitle: 'Senior MLT',
    });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.token);
  assert.equal(res.body.session.role, 'LAB_STAFF');
  assert.equal(res.body.session.facilityCode, labCode);
  assert.equal(res.body.session.licenseNumber, phsrcRegNo);
  assert.equal(res.body.facility.type, 'LAB');
});

test('Phase 8: Public Facilities Listing allows filtering by facility type', async () => {
  const res = await request(app).get('/api/facilities?type=HOSPITAL');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.facilities));
  assert.ok(res.body.facilities.length > 0);
  assert.ok(res.body.facilities.every((f) => f.type === 'HOSPITAL'));
});
