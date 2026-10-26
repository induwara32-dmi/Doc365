// Tests for patient registration, newborns with guardians, and NIC linking.
// Uses a fixed "today" so ages do not change when the tests run on another day.
import './guard.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db.js';
import { AppError } from '../src/errors.js';
import { registerPatient, registerNewborn, linkNic } from '../src/patients/patient-service.js';
import { buildFhirPatient, NIC_SYSTEM } from '../src/patients/fhir-patient.js';
import { guardianAccessActive } from '../src/patients/age.js';
import { createTestPatient, cardsOf, uniqueName, randomBirthAndNic, TEST_ACTOR } from './helpers.js';

const TODAY = new Date('2026-10-26');

after(async () => {
  await prisma.$disconnect();
});

// Rejects with AppError and the given code
async function assertAppError(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof AppError, `expected AppError ${code}, got ${err.name}: ${err.message}`);
    assert.equal(err.code, code);
    return true;
  });
}

function countByFamilyName(familyName) {
  return prisma.patient.count({ where: { familyName } });
}

// The stored FHIR JSON must be exactly what buildFhirPatient makes from the columns
function assertFhirMatchesColumns(patient) {
  assert.deepEqual(patient.fhir, buildFhirPatient(patient));
}

// ---------- registerPatient ----------

test('register an adult with an old-form NIC: saved normalized, FHIR from columns, one ACTIVE card', async () => {
  const { dateOfBirth, nic: randomNic } = randomBirthAndNic({ fromYear: 1960, toYear: 1999 });
  // A converted old NIC always has "0" before the last 4 digits (YYYY DDD 0 SSS C)
  const digits = randomNic.slice('DEMO-NIC-'.length);
  const newNic = `DEMO-NIC-${digits.slice(0, 7)}0${digits.slice(8)}`;
  const oldNic = `DEMO-NIC-${digits.slice(2, 7)}${digits.slice(8)}V`; // 9 digits + V

  const { patient, card, warnings } = await registerPatient(
    { givenName: 'Nimal', familyName: uniqueName(), sex: 'male', dateOfBirth, nic: oldNic },
    { actor: TEST_ACTOR, today: TODAY },
  );

  assert.equal(patient.nic, newNic);
  const nic = newNic;
  assert.deepEqual(warnings, []);
  assert.equal(card.status, 'ACTIVE');
  assertFhirMatchesColumns(patient);
  assert.ok(patient.fhir.identifier.some((i) => i.system === NIC_SYSTEM && i.value === nic));
});

test('a NIC that encodes the other sex is saved, with a warning for staff', async () => {
  const { dateOfBirth, nic } = randomBirthAndNic({ fromYear: 1960, toYear: 1999, sex: 'female' });

  const { patient, warnings } = await registerPatient(
    { familyName: uniqueName(), sex: 'male', dateOfBirth, nic },
    { actor: TEST_ACTOR, today: TODAY },
  );

  assert.equal(patient.nic, nic);
  assert.deepEqual(warnings.map((w) => w.code), ['NIC_SEX_MISMATCH']);
});

test('invalid details are rejected and nothing is saved', async () => {
  const familyName = uniqueName();
  const good = { familyName, sex: 'female', dateOfBirth: '1990-04-01' };

  await assertAppError(registerPatient({ ...good, familyName: '  ' }, { actor: TEST_ACTOR, today: TODAY }), 'INVALID_PATIENT_DATA');
  await assertAppError(registerPatient({ ...good, sex: 'F' }, { actor: TEST_ACTOR, today: TODAY }), 'INVALID_PATIENT_DATA');
  await assertAppError(registerPatient({ ...good, dateOfBirth: '1999-02-29' }, { actor: TEST_ACTOR, today: TODAY }), 'INVALID_PATIENT_DATA');
  await assertAppError(registerPatient({ ...good, dateOfBirth: '2026-10-27' }, { actor: TEST_ACTOR, today: TODAY }), 'INVALID_PATIENT_DATA');
  await assertAppError(registerPatient(good, { healthId: 'DEMO-123456-7', actor: TEST_ACTOR, today: TODAY }), 'INVALID_PATIENT_DATA');

  assert.equal(await countByFamilyName(familyName), 0);
});

test('a NIC cannot be registered for someone under 16', async () => {
  const familyName = uniqueName();
  const { dateOfBirth, nic } = randomBirthAndNic({ fromYear: 2012, toYear: 2015 });

  await assertAppError(
    registerPatient({ familyName, sex: 'male', dateOfBirth, nic }, { actor: TEST_ACTOR, today: TODAY }),
    'TOO_YOUNG_FOR_NIC',
  );
  assert.equal(await countByFamilyName(familyName), 0);
});

test('a NIC already linked to another patient is refused with NIC_ALREADY_LINKED', async () => {
  const { dateOfBirth, nic } = randomBirthAndNic({ fromYear: 1960, toYear: 1999 });
  await registerPatient({ familyName: uniqueName(), sex: 'male', dateOfBirth, nic }, { actor: TEST_ACTOR, today: TODAY });

  const familyName = uniqueName();
  await assertAppError(
    registerPatient({ familyName, sex: 'male', dateOfBirth, nic }, { actor: TEST_ACTOR, today: TODAY }),
    'NIC_ALREADY_LINKED',
  );
  assert.equal(await countByFamilyName(familyName), 0);
});

// ---------- registerNewborn ----------

test('register a newborn: child, ACTIVE card and guardian link are all saved', async () => {
  const mother = await createTestPatient({ sex: 'female', dateOfBirth: new Date('1995-03-10') });

  const { patient, card, guardianLink } = await registerNewborn(
    {
      child: { familyName: uniqueName(), sex: 'female', dateOfBirth: '2026-10-20' },
      guardianHealthId: mother.healthId,
      relationship: 'MOTHER',
    },
    { actor: TEST_ACTOR, today: TODAY },
  );

  assert.equal(card.status, 'ACTIVE');
  assert.equal(guardianLink.guardianId, mother.id);
  assert.equal(guardianLink.childId, patient.id);
  assert.equal(patient.nic, null);
  assert.equal(patient.givenName, null); // no given name yet
  assertFhirMatchesColumns(patient);
  assert.equal(guardianAccessActive(patient.dateOfBirth, TODAY), true);
});

test('a guardian must be 18 or older, and must exist', async () => {
  const familyName = uniqueName();
  const child = { familyName, sex: 'male', dateOfBirth: '2026-10-20' };
  const seventeen = await createTestPatient({ dateOfBirth: new Date('2009-01-01') });

  await assertAppError(
    registerNewborn({ child, guardianHealthId: seventeen.healthId, relationship: 'MOTHER' }, { actor: TEST_ACTOR, today: TODAY }),
    'GUARDIAN_TOO_YOUNG',
  );
  await assertAppError(
    registerNewborn({ child, guardianHealthId: 'DEMO-000000-0', relationship: 'MOTHER' }, { actor: TEST_ACTOR, today: TODAY }),
    'GUARDIAN_NOT_FOUND',
  );
  assert.equal(await countByFamilyName(familyName), 0);
});

test('only children under 16 are registered with a guardian', async () => {
  const mother = await createTestPatient({ dateOfBirth: new Date('1980-01-01') });
  await assertAppError(
    registerNewborn(
      {
        child: { familyName: uniqueName(), sex: 'male', dateOfBirth: '2010-10-26' }, // 16 today
        guardianHealthId: mother.healthId,
        relationship: 'MOTHER',
      },
      { actor: TEST_ACTOR, today: TODAY },
    ),
    'TOO_OLD_FOR_GUARDIAN',
  );
});

test('newborn rollback: if the card fails, no child and no guardian link are saved', async () => {
  const mother = await createTestPatient({ dateOfBirth: new Date('1995-03-10') });
  const existingCard = await prisma.card.create({ data: { serial: `TEST-${uniqueName()}`, patientId: mother.id } });
  const familyName = uniqueName();

  await assert.rejects(
    registerNewborn(
      {
        child: { familyName, sex: 'male', dateOfBirth: '2026-10-20' },
        guardianHealthId: mother.healthId,
        relationship: 'MOTHER',
      },
      // Inject a serial that already exists, so the card fails AFTER the child was created
      { actor: TEST_ACTOR, today: TODAY, makeSerial: () => existingCard.serial },
    ),
    (err) => err.code === 'P2002' && err.meta.target.includes('serial'),
  );

  assert.equal(await countByFamilyName(familyName), 0);
  assert.equal(await prisma.guardianLink.count({ where: { guardianId: mother.id } }), 0);
});

// ---------- linkNic ----------

// A child registered at birth (on its birthday), with a guardian, returned
// together with the day it turns 16 and a NIC that fits its date of birth.
async function childRegisteredAtBirth({ sex = 'male' } = {}) {
  const { dateOfBirth, nic } = randomBirthAndNic({ fromYear: 2008, toYear: 2010, sex });
  const mother = await createTestPatient({ sex: 'female', dateOfBirth: new Date('1980-01-01') });
  const { patient, card } = await registerNewborn(
    {
      child: { givenName: 'Sanduni', familyName: uniqueName(), sex, dateOfBirth },
      guardianHealthId: mother.healthId,
      relationship: 'MOTHER',
    },
    { actor: TEST_ACTOR, today: new Date(dateOfBirth) },
  );
  const sixteenthBirthday = new Date(dateOfBirth);
  sixteenthBirthday.setUTCFullYear(sixteenthBirthday.getUTCFullYear() + 16);
  return { child: patient, firstCard: card, mother, nic, sixteenthBirthday };
}

async function assertNothingChanged(child, firstCard) {
  const reloaded = await prisma.patient.findUnique({ where: { id: child.id } });
  assert.equal(reloaded.nic, null);
  assert.deepEqual(reloaded.fhir, child.fhir);
  const cards = await cardsOf(child.id);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, firstCard.id);
  assert.equal(cards[0].status, 'ACTIVE');
}

test('linking a NIC at 16: NIC set, FHIR rebuilt, old card REPLACED, new card ACTIVE', async () => {
  const { child, firstCard, mother, nic, sixteenthBirthday } = await childRegisteredAtBirth();

  const { patient, card, warnings } = await linkNic(child.healthId, nic, { actor: TEST_ACTOR, today: sixteenthBirthday });

  assert.equal(patient.nic, nic);
  assert.deepEqual(warnings, []);
  assertFhirMatchesColumns(patient);
  assert.ok(patient.fhir.identifier.some((i) => i.system === NIC_SYSTEM && i.value === nic));

  const cards = await cardsOf(child.id);
  assert.equal(cards.length, 2);
  const old = cards.find((c) => c.id === firstCard.id);
  assert.equal(old.status, 'REPLACED');
  assert.match(old.endedReason, /NIC was linked at 16/);
  assert.equal(cards.find((c) => c.status === 'ACTIVE').id, card.id);

  // The guardian link stays as history; access has ended by age, not by deleting it
  const links = await prisma.guardianLink.findMany({ where: { childId: child.id } });
  assert.equal(links.length, 1);
  assert.equal(links[0].guardianId, mother.id);
  assert.equal(guardianAccessActive(patient.dateOfBirth, sixteenthBirthday), false);
});

test('linking a NIC the day before the 16th birthday is refused, nothing changes', async () => {
  const { child, firstCard, nic, sixteenthBirthday } = await childRegisteredAtBirth();
  const dayBefore = new Date(sixteenthBirthday.getTime() - 86_400_000);

  await assertAppError(linkNic(child.healthId, nic, { actor: TEST_ACTOR, today: dayBefore }), 'TOO_YOUNG_FOR_NIC');
  await assertNothingChanged(child, firstCard);
});

test('a NIC that does not fit the date of birth is refused, nothing changes', async () => {
  const { child, firstCard, sixteenthBirthday } = await childRegisteredAtBirth();
  const { nic: someoneElsesNic } = randomBirthAndNic({ fromYear: 1970, toYear: 1979 });

  await assertAppError(linkNic(child.healthId, someoneElsesNic, { actor: TEST_ACTOR, today: sixteenthBirthday }), 'NIC_DOB_MISMATCH');
  await assertNothingChanged(child, firstCard);
});

test('linkNic rollback: if the card renewal fails, the NIC is not saved', async () => {
  const { child, firstCard, nic, sixteenthBirthday } = await childRegisteredAtBirth();

  await assert.rejects(
    linkNic(child.healthId, nic, { actor: TEST_ACTOR, today: sixteenthBirthday, makeSerial: () => firstCard.serial }),
    (err) => err.code === 'P2002' && err.meta.target.includes('serial'),
  );
  await assertNothingChanged(child, firstCard);
});

test('a NIC cannot be linked twice', async () => {
  const { child, nic, sixteenthBirthday } = await childRegisteredAtBirth();
  await linkNic(child.healthId, nic, { actor: TEST_ACTOR, today: sixteenthBirthday });

  await assertAppError(linkNic(child.healthId, nic, { actor: TEST_ACTOR, today: sixteenthBirthday }), 'NIC_ALREADY_SET');
});

// The same NIC with the other sex: +500 added (male -> female) or removed
function withOtherSex(nic) {
  const digits = nic.slice('DEMO-NIC-'.length);
  const dayCode = Number(digits.slice(4, 7));
  const flipped = String(dayCode > 500 ? dayCode - 500 : dayCode + 500).padStart(3, '0');
  return `DEMO-NIC-${digits.slice(0, 4)}${flipped}${digits.slice(7)}`;
}

test('linking a NIC that encodes the other sex works, with a warning for staff', async () => {
  const { child, nic, sixteenthBirthday } = await childRegisteredAtBirth({ sex: 'male' });
  const femaleNic = withOtherSex(nic);

  const { patient, warnings } = await linkNic(child.healthId, femaleNic, { actor: TEST_ACTOR, today: sixteenthBirthday });
  assert.equal(patient.nic, femaleNic);
  assert.deepEqual(warnings.map((w) => w.code), ['NIC_SEX_MISMATCH']);
});

test('linkNic for an unknown Health ID gives PATIENT_NOT_FOUND', async () => {
  await assertAppError(linkNic('DEMO-000000-0', 'DEMO-NIC-198554200159', { actor: TEST_ACTOR, today: TODAY }), 'PATIENT_NOT_FOUND');
});
