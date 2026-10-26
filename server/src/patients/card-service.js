// Health cards (DESIGN.md section 1). A card is a key, not a storage device:
// it holds no medical data. Lost card: block it and issue a new one; no data is lost.
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';

// 6 random bytes (48 bits) shown as 12 hex characters, e.g. CARD-7F3A-9C21-0B4E.
// Random, never a counter, so nobody can guess another card's serial.
export function generateCardSerial() {
  const hex = randomBytes(6).toString('hex').toUpperCase();
  return `CARD-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8)}`;
}

// Issue a new ACTIVE card.
// Options:
// - db: pass the transaction client when calling inside a transaction
//   (e.g. registering a newborn), so the card is saved together with the rest.
// - makeSerial: the function that makes the serial. Normal code never passes it;
//   tests can pass their own (dependency injection) to force a failure.
export async function issueCard(patientId, { db = prisma, makeSerial = generateCardSerial } = {}) {
  return db.card.create({ data: { serial: await makeSerial(), patientId } });
}

// Block a lost or stolen card. Scanning it is refused from now on.
export async function blockCard(serial, reason) {
  if (!reason) throw new Error('A reason is required to block a card');

  const result = await prisma.card.updateMany({
    where: { serial, status: 'ACTIVE' },
    data: { status: 'BLOCKED', endedAt: new Date(), endedReason: reason },
  });
  if (result.count === 0) throw new Error(`No ACTIVE card with serial ${serial}`);
}

// Give a patient a new card.
// oldStatus: 'BLOCKED' for a lost or stolen card, 'REPLACED' for a normal renewal
// (e.g. a new photo at 16).
// Ending the old card and creating the new one happen in ONE transaction: either
// both are saved or neither. The old card must be ended first, because the database
// allows only one ACTIVE card per patient (index "Card_one_active_per_patient").
// If the patient has no ACTIVE card (it was already blocked), this just issues a new one.
// If another desk issued a card for this patient at the same moment, the database
// refuses the second ACTIVE card; that becomes AppError CARD_CHANGED_CONCURRENTLY.
// Pass `db` (a transaction client) to run inside the caller's transaction, e.g.
// linking a NIC renews the card in the same transaction. Prisma cannot nest
// transactions, so without `db` this opens its own.
export async function replaceCard(patientId, { oldStatus, reason, makeSerial = generateCardSerial, db }) {
  if (oldStatus !== 'BLOCKED' && oldStatus !== 'REPLACED') {
    throw new Error('oldStatus must be BLOCKED or REPLACED');
  }
  if (!reason) throw new Error('A reason is required to replace a card');

  const endOldAndIssueNew = async (tx) => {
    await tx.card.updateMany({
      where: { patientId, status: 'ACTIVE' },
      data: { status: oldStatus, endedAt: new Date(), endedReason: reason },
    });
    return issueCard(patientId, { db: tx, makeSerial });
  };

  try {
    return db ? await endOldAndIssueNew(db) : await prisma.$transaction(endOldAndIssueNew);
  } catch (err) {
    // P2002 = unique rule broken. target ["patientId"] means the
    // "one ACTIVE card per patient" index (a serial clash has target ["serial"]).
    if (err.code === 'P2002' && err.meta?.target?.includes('patientId')) {
      throw new AppError(
        'CARD_CHANGED_CONCURRENTLY',
        'This card was just changed at another desk. Please reload and try again.',
      );
    }
    throw err;
  }
}

// What the card's QR code contains: ONLY the Health ID and the card serial
// (CLAUDE.md Phase 2). No name, no medical data.
export function cardQrPayload(healthId, serial) {
  return JSON.stringify({ healthId, serial });
}
