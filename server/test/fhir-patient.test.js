// Tests for buildFhirPatient: a pure function, no database needed.
import './guard.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFhirPatient, HEALTH_ID_SYSTEM, NIC_SYSTEM } from '../src/patients/fhir-patient.js';

const columns = {
  id: '11111111-1111-4111-8111-111111111111',
  healthId: 'DEMO-123456-6',
  nic: 'DEMO-NIC-198554200159',
  givenName: 'Kasun Dilshan',
  familyName: 'Perera',
  fullName: 'Warnakulasuriya Patabendige Kasun Dilshan Perera',
  sex: 'male',
  dateOfBirth: new Date('1985-06-23'),
};

test('builds the exact FHIR Patient from all columns', () => {
  assert.deepEqual(buildFhirPatient(columns), {
    resourceType: 'Patient',
    id: '11111111-1111-4111-8111-111111111111',
    identifier: [
      { use: 'official', system: HEALTH_ID_SYSTEM, value: 'DEMO-123456-6' },
      { use: 'secondary', system: NIC_SYSTEM, value: 'DEMO-NIC-198554200159' },
    ],
    name: [
      {
        use: 'official',
        family: 'Perera',
        given: ['Kasun', 'Dilshan'],
        text: 'Warnakulasuriya Patabendige Kasun Dilshan Perera',
      },
    ],
    gender: 'male',
    birthDate: '1985-06-23',
  });
});

test('a newborn without NIC, given name or full name: those parts are left out, never null', () => {
  const fhir = buildFhirPatient({ ...columns, nic: null, givenName: null, fullName: null });

  assert.equal(fhir.identifier.length, 1);
  assert.equal(fhir.identifier[0].system, HEALTH_ID_SYSTEM);
  assert.deepEqual(fhir.name, [{ use: 'official', family: 'Perera' }]);
  // FHIR does not allow null values anywhere
  assert.ok(!JSON.stringify(fhir).includes('null'));
});

test('the Health ID system matches the Phase 1 sample report', () => {
  assert.equal(HEALTH_ID_SYSTEM, 'urn:doc365:demo-phn');
});

test('the same columns always give the same JSON, and the input is not changed', () => {
  const copy = structuredClone(columns);
  assert.deepEqual(buildFhirPatient(columns), buildFhirPatient(columns));
  assert.deepEqual(columns, copy);
});

test('every Sex value goes straight into gender', () => {
  for (const sex of ['male', 'female', 'other', 'unknown']) {
    assert.equal(buildFhirPatient({ ...columns, sex }).gender, sex);
  }
});
