// Tests for the card service: serials, issuing, blocking and replacing cards.
import './guard.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db.js';
import { generateCardSerial, issueCard, blockCard, replaceCard } from '../src/patients/card-service.js';
import { AppError } from '../src/errors.js';
import { createTestPatient, cardsOf } from './helpers.js';

after(async () => {
  await prisma.$disconnect();
});

test('card serials have the CARD-XXXX-XXXX-XXXX format and do not repeat', () => {
  const serials = new Set();
  for (let i = 0; i < 1000; i++) {
    const serial = generateCardSerial();
    assert.match(serial, /^CARD-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    serials.add(serial);
  }
  assert.equal(serials.size, 1000);
});

test('a new card is ACTIVE', async () => {
  const patient = await createTestPatient();
  const card = await issueCard(patient.id);
  assert.equal(card.status, 'ACTIVE');
  assert.equal(card.endedAt, null);
});

test('renewal marks the old card REPLACED (not BLOCKED)', async () => {
  const patient = await createTestPatient();
  const oldCard = await issueCard(patient.id);

  await replaceCard(patient.id, { oldStatus: 'REPLACED', reason: 'Renewal with new photo at 16' });

  const old = (await cardsOf(patient.id)).find((c) => c.id === oldCard.id);
  assert.equal(old.status, 'REPLACED');
});

test('a card blocked by phone stays BLOCKED when the new card is issued later', async () => {
  const patient = await createTestPatient();
  const lost = await issueCard(patient.id);

  await blockCard(lost.serial, 'Reported stolen by phone');
  // Later, at the service desk:
  await replaceCard(patient.id, { oldStatus: 'BLOCKED', reason: 'New card after theft' });

  const cards = await cardsOf(patient.id);
  const old = cards.find((c) => c.id === lost.id);
  assert.equal(old.status, 'BLOCKED');
  assert.equal(old.endedReason, 'Reported stolen by phone'); // first reason is kept
  assert.equal(cards.filter((c) => c.status === 'ACTIVE').length, 1);
});

test('blocking a card that is not ACTIVE fails', async () => {
  const patient = await createTestPatient();
  const card = await issueCard(patient.id);
  await blockCard(card.serial, 'Lost');

  await assert.rejects(blockCard(card.serial, 'Lost again'), /No ACTIVE card/);
  await assert.rejects(blockCard('CARD-0000-0000-0000', 'Lost'), /No ACTIVE card/);
});

test('blocking or replacing without a reason, or with a wrong status, changes nothing', async () => {
  const patient = await createTestPatient();
  const card = await issueCard(patient.id);

  await assert.rejects(blockCard(card.serial, ''), /reason is required/);
  await assert.rejects(replaceCard(patient.id, { oldStatus: 'BLOCKED' }), /reason is required/);
  await assert.rejects(replaceCard(patient.id, { oldStatus: 'ACTIVE', reason: 'x' }), /BLOCKED or REPLACED/);

  const cards = await cardsOf(patient.id);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].status, 'ACTIVE');
});

test('if creating the new card fails, the old card stays ACTIVE (rollback)', async () => {
  const patient = await createTestPatient();
  const oldCard = await issueCard(patient.id);

  // Inject a serial generator that returns a serial that already exists,
  // so creating the new card fails on the unique serial index AFTER the
  // old card was already ended inside the transaction.
  await assert.rejects(
    replaceCard(patient.id, {
      oldStatus: 'BLOCKED',
      reason: 'Lost',
      makeSerial: () => oldCard.serial,
    }),
    // A serial clash is NOT a concurrency problem, so it stays a raw P2002
    (err) => err.code === 'P2002' && err.meta.target.includes('serial'),
  );

  const cards = await cardsOf(patient.id);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].status, 'ACTIVE');
  assert.equal(cards[0].endedAt, null);
  assert.equal(cards[0].endedReason, null);
});

test('losing a race with another desk gives CARD_CHANGED_CONCURRENTLY', async () => {
  const patient = await createTestPatient();
  const lost = await issueCard(patient.id);
  // Start with the card already blocked by phone, so desk A's transaction
  // locks no card row. (If it did, desk B below would wait for desk A while
  // desk A waits for desk B: a deadlock.)
  await blockCard(lost.serial, 'Reported lost by phone');

  // Desk A replaces the card. Just before desk A creates its new card,
  // the injected generator lets desk B issue one first (committed).
  const err = await replaceCard(patient.id, {
    oldStatus: 'BLOCKED',
    reason: 'Desk A',
    makeSerial: async () => {
      await issueCard(patient.id); // desk B wins the race
      return generateCardSerial();
    },
  }).catch((e) => e);

  assert.ok(err instanceof AppError, `expected AppError, got ${err?.name}: ${err?.message}`);
  assert.equal(err.code, 'CARD_CHANGED_CONCURRENTLY');
  assert.match(err.message, /reload/);

  const cards = await cardsOf(patient.id);
  assert.equal(cards.filter((c) => c.status === 'ACTIVE').length, 1); // desk B's card
});

test('two replacements at the same time still leave exactly one ACTIVE card', async () => {
  const patient = await createTestPatient();
  await issueCard(patient.id);

  // Two desks press "replace" at the same moment. One may fail; that is fine,
  // but only with our clear app error. What must never happen is two ACTIVE cards.
  const results = await Promise.allSettled([
    replaceCard(patient.id, { oldStatus: 'BLOCKED', reason: 'Desk A' }),
    replaceCard(patient.id, { oldStatus: 'BLOCKED', reason: 'Desk B' }),
  ]);

  for (const r of results.filter((r) => r.status === 'rejected')) {
    assert.ok(r.reason instanceof AppError, `raw error leaked: ${r.reason?.message}`);
    assert.equal(r.reason.code, 'CARD_CHANGED_CONCURRENTLY');
  }
  const cards = await cardsOf(patient.id);
  assert.equal(cards.filter((c) => c.status === 'ACTIVE').length, 1);
});
