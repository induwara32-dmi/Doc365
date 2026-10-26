// Tests for the append-only AuditLog and for auditing card and patient changes.
import './guard.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db.js';
import { writeAudit, systemActor } from '../src/audit/audit-log.js';
import { issueCard, blockCard, replaceCard } from '../src/patients/card-service.js';
import { registerPatient, registerNewborn, linkNic } from '../src/patients/patient-service.js';
import { createTestPatient, cardsOf, uniqueName, randomBirthAndNic, TEST_ACTOR } from './helpers.js';

after(async () => {
  await prisma.$disconnect();
});

// The error must come from OUR trigger (its message), not from anything else
function isAppendOnlyError(err) {
  return /AuditLog is append-only: (UPDATE|DELETE|TRUNCATE) is not allowed/.test(err.message);
}

async function oneAuditRow() {
  return writeAudit(systemActor('test'), { action: 'test.row', reason: uniqueName() });
}

// ---------- The database refuses changes ----------

test('the database refuses UPDATE on AuditLog (raw SQL and Prisma)', async () => {
  const row = await oneAuditRow();

  await assert.rejects(
    prisma.$executeRaw`UPDATE "AuditLog" SET "reason" = 'changed' WHERE "id" = ${row.id}::uuid`,
    isAppendOnlyError,
  );
  await assert.rejects(prisma.auditLog.update({ where: { id: row.id }, data: { reason: 'changed' } }), isAppendOnlyError);
  await assert.rejects(prisma.auditLog.updateMany({ data: { reason: 'changed' } }), isAppendOnlyError);

  const after = await prisma.auditLog.findUnique({ where: { id: row.id } });
  assert.equal(after.reason, row.reason);
});

test('the database refuses DELETE on AuditLog (raw SQL and Prisma)', async () => {
  const row = await oneAuditRow();

  await assert.rejects(prisma.$executeRaw`DELETE FROM "AuditLog" WHERE "id" = ${row.id}::uuid`, isAppendOnlyError);
  await assert.rejects(prisma.auditLog.delete({ where: { id: row.id } }), isAppendOnlyError);
  await assert.rejects(prisma.auditLog.deleteMany({}), isAppendOnlyError);

  assert.ok(await prisma.auditLog.findUnique({ where: { id: row.id } }));
});

test('the database refuses TRUNCATE on AuditLog', async () => {
  const row = await oneAuditRow();

  await assert.rejects(prisma.$executeRawUnsafe('TRUNCATE "AuditLog"'), isAppendOnlyError);

  // TRUNCATE empties the whole table at once, so if our row survived, nothing was removed.
  // (Do not compare total row counts: other test files write audit rows in parallel.)
  assert.ok(await prisma.auditLog.findUnique({ where: { id: row.id } }));
});

test('the triggers really exist on the AuditLog table', async () => {
  const triggers = await prisma.$queryRaw`
    SELECT tgname FROM pg_trigger WHERE tgrelid = '"AuditLog"'::regclass AND NOT tgisinternal ORDER BY tgname`;
  assert.deepEqual(
    triggers.map((t) => t.tgname),
    ['AuditLog_append_only', 'AuditLog_no_truncate'],
  );
});

// ---------- Card changes are audited ----------

test('blocking a card writes one audit row with serial, reason and old/new status', async () => {
  const patient = await createTestPatient();
  const card = await issueCard(patient.id);

  await blockCard(card.serial, 'Lost on the bus', TEST_ACTOR);

  const rows = await prisma.auditLog.findMany({ where: { action: 'card.block', targetId: card.serial } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].patientId, patient.id);
  assert.equal(rows[0].targetType, 'Card');
  assert.equal(rows[0].reason, 'Lost on the bus');
  assert.equal(rows[0].actorLabel, 'system (test)');
  assert.deepEqual(rows[0].details, { oldStatus: 'ACTIVE', newStatus: 'BLOCKED' });
});

test('replacing a card writes one audit row with the old and new serial', async () => {
  const patient = await createTestPatient();
  const oldCard = await issueCard(patient.id);

  const newCard = await replaceCard(patient.id, { actor: TEST_ACTOR, oldStatus: 'BLOCKED', reason: 'Stolen' });

  const rows = await prisma.auditLog.findMany({ where: { action: 'card.replace', patientId: patient.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].targetId, newCard.serial);
  assert.equal(rows[0].reason, 'Stolen');
  assert.deepEqual(rows[0].details, {
    oldSerial: oldCard.serial,
    oldCardNewStatus: 'BLOCKED',
    newSerial: newCard.serial,
  });
});

test('the card change and its audit row are one transaction: a failed replace leaves no audit row', async () => {
  const patient = await createTestPatient();
  const oldCard = await issueCard(patient.id);

  await assert.rejects(
    replaceCard(patient.id, {
      actor: TEST_ACTOR,
      oldStatus: 'BLOCKED',
      reason: 'Lost',
      makeSerial: () => oldCard.serial, // forces the new card to fail
    }),
  );

  assert.equal(await prisma.auditLog.count({ where: { patientId: patient.id, action: 'card.replace' } }), 0);
  assert.equal((await cardsOf(patient.id))[0].status, 'ACTIVE');
});

test('changes without an actor are refused before anything changes', async () => {
  const patient = await createTestPatient();
  const card = await issueCard(patient.id);

  await assert.rejects(blockCard(card.serial, 'Lost'), /actor is required/);
  await assert.rejects(replaceCard(patient.id, { oldStatus: 'BLOCKED', reason: 'Lost' }), /actor is required/);
  await assert.rejects(registerPatient({ familyName: uniqueName(), sex: 'male', dateOfBirth: '1990-01-01' }), /actor is required/);

  assert.equal((await cardsOf(patient.id))[0].status, 'ACTIVE');
  assert.equal(await prisma.auditLog.count({ where: { patientId: patient.id } }), 0);
});

// ---------- Patient changes are audited ----------

test('registration, newborn registration and NIC linking are audited (without copying the NIC)', async () => {
  const today = new Date('2026-10-26');
  const mother = await registerPatient(
    { familyName: uniqueName(), sex: 'female', dateOfBirth: '1990-04-01' },
    { actor: TEST_ACTOR, today },
  );
  const baby = await registerNewborn(
    {
      child: { familyName: uniqueName(), sex: 'male', dateOfBirth: '2026-10-20' },
      guardianHealthId: mother.patient.healthId,
      relationship: 'MOTHER',
    },
    { actor: TEST_ACTOR, today },
  );

  const { dateOfBirth, nic } = randomBirthAndNic({ fromYear: 2005, toYear: 2009 });
  const teen = await registerPatient({ familyName: uniqueName(), sex: 'male', dateOfBirth }, { actor: TEST_ACTOR, today });
  await linkNic(teen.patient.healthId, nic, { actor: TEST_ACTOR, today });

  const actionsFor = async (patientId) =>
    (await prisma.auditLog.findMany({ where: { patientId }, orderBy: { at: 'asc' } })).map((r) => r.action);

  assert.deepEqual(await actionsFor(mother.patient.id), ['patient.register']);
  assert.deepEqual(await actionsFor(baby.patient.id), ['patient.register_newborn']);
  assert.deepEqual((await actionsFor(teen.patient.id)).sort(), ['card.replace', 'patient.link_nic', 'patient.register']);

  const teenRows = await prisma.auditLog.findMany({ where: { patientId: teen.patient.id } });
  assert.ok(!JSON.stringify(teenRows).includes(nic.slice('DEMO-NIC-'.length)), 'the NIC must not be in the audit log');
});
