// Shared helpers for tests. Not a test file itself (it does not end in .test.js).
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db.js';

// A throwaway patient with a unique test Health ID. Never deleted (see CLAUDE.md).
// Pass fields to override the defaults, e.g. createTestPatient({ nic, dateOfBirth }).
export async function createTestPatient(overrides = {}) {
  return prisma.patient.create({
    data: {
      healthId: `DEMO-TEST-${randomUUID()}`,
      familyName: 'Test',
      sex: 'unknown',
      dateOfBirth: new Date('2000-01-01'),
      fhir: { resourceType: 'Patient' },
      ...overrides,
    },
  });
}

// All cards of a patient, oldest first
export async function cardsOf(patientId) {
  return prisma.card.findMany({ where: { patientId }, orderBy: { issuedAt: 'asc' } });
}
