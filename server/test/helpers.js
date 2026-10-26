// Shared helpers for tests. Not a test file itself (it does not end in .test.js).
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db.js';

// A throwaway patient with a unique test Health ID. Never deleted (see CLAUDE.md).
export async function createTestPatient() {
  return prisma.patient.create({
    data: {
      healthId: `DEMO-TEST-${randomUUID()}`,
      dateOfBirth: new Date('2000-01-01'),
      fhir: { resourceType: 'Patient' },
    },
  });
}

// All cards of a patient, oldest first
export async function cardsOf(patientId) {
  return prisma.card.findMany({ where: { patientId }, orderBy: { issuedAt: 'asc' } });
}
