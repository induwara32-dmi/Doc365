// Tests for the database rules written by hand in the Phase 2 migration.
// They talk to PostgreSQL directly (through Prisma), not through our app code,
// so they fail if a future migration ever drops one of these rules.
// Runs on the doc365_test database. Test data is never deleted (records are
// append-only); random IDs keep every run separate.
import './guard.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db.js';
import { issueCard, replaceCard } from '../src/patients/card-service.js';
import { createTestPatient, cardsOf } from './helpers.js';

function testSerial() {
  return `TEST-${randomUUID()}`;
}

after(async () => {
  await prisma.$disconnect();
});

test('a second ACTIVE card for the same patient is refused', async () => {
  const patient = await createTestPatient();
  await prisma.card.create({ data: { serial: testSerial(), patientId: patient.id } });

  await assert.rejects(
    prisma.card.create({ data: { serial: testSerial(), patientId: patient.id } }),
    (err) => err.code === 'P2002', // P2002 = unique constraint failed
  );
});

test('a patient can have a BLOCKED card and one ACTIVE card', async () => {
  const patient = await createTestPatient();
  await prisma.card.create({
    data: { serial: testSerial(), patientId: patient.id, status: 'BLOCKED' },
  });

  const active = await prisma.card.create({ data: { serial: testSerial(), patientId: patient.id } });
  assert.equal(active.status, 'ACTIVE');
});

test('a patient cannot be their own guardian', async () => {
  const patient = await createTestPatient();

  await assert.rejects(
    prisma.guardianLink.create({
      data: { childId: patient.id, guardianId: patient.id, relationship: 'MOTHER' },
    }),
    /GuardianLink_not_own_guardian/,
  );
});

test('replacing a card leaves exactly one ACTIVE card and the old one BLOCKED', async () => {
  const patient = await createTestPatient();
  const oldCard = await issueCard(patient.id);

  const newCard = await replaceCard(patient.id, { oldStatus: 'BLOCKED', reason: 'Lost on bus' });

  const cards = await cardsOf(patient.id);
  assert.equal(cards.length, 2);
  assert.equal(cards.filter((c) => c.status === 'ACTIVE').length, 1);

  const old = cards.find((c) => c.id === oldCard.id);
  assert.equal(old.status, 'BLOCKED');
  assert.equal(old.endedReason, 'Lost on bus');
  assert.ok(old.endedAt);

  const active = cards.find((c) => c.status === 'ACTIVE');
  assert.equal(active.id, newCard.id);
  assert.notEqual(newCard.serial, oldCard.serial);
});
