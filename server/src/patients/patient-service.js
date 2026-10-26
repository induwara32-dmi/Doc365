// Patients (DESIGN.md section 1): one record per person, for life.
// Every write that touches several tables runs in ONE transaction.
// The FHIR JSON is always rebuilt from the columns (buildFhirPatient), never edited.
import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { normalizeNic, checkNicAgainstPatient } from './nic.js';
import { generateHealthId, isValidHealthId } from './health-id.js';
import { buildFhirPatient } from './fhir-patient.js';
import { issueCard, replaceCard, generateCardSerial } from './card-service.js';
import { requireActor, writeAudit } from '../audit/audit-log.js';
import {
  ageOn,
  parseDate,
  todayInSriLanka,
  NIC_MIN_AGE,
  GUARDIAN_MIN_AGE,
  GUARDIAN_ACCESS_ENDS_AT,
} from './age.js';

const SEXES = ['male', 'female', 'other', 'unknown'];
const RELATIONSHIPS = ['MOTHER', 'FATHER', 'LEGAL_GUARDIAN'];
const HEALTH_ID_ATTEMPTS = 5;

function invalidData(message) {
  return new AppError('INVALID_PATIENT_DATA', message);
}

// Trimmed text, or null when empty
function optionalText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

// Checks and cleans the details typed at the desk. Returns the column values.
function cleanDemographics({ givenName, familyName, fullName, sex, dateOfBirth }, today) {
  const family = optionalText(familyName);
  if (!family) throw invalidData('Family name is required');
  if (!SEXES.includes(sex)) throw invalidData(`Sex must be one of: ${SEXES.join(', ')}`);

  const dob = parseDate(dateOfBirth);
  if (!dob) throw invalidData('Date of birth must be a real date in the form YYYY-MM-DD');
  if (dob > today) throw invalidData('Date of birth cannot be in the future');

  return {
    givenName: optionalText(givenName),
    familyName: family,
    fullName: optionalText(fullName),
    sex,
    dateOfBirth: dob,
  };
}

// A NIC that already belongs to another patient breaks the unique index on nic
function mapNicClash(err) {
  if (err.code === 'P2002' && err.meta?.target?.includes('nic')) {
    return new AppError('NIC_ALREADY_LINKED', 'This NIC is already linked to another patient');
  }
  return err;
}

// Runs work(healthId) with a new random Health ID, and tries again with another
// one if that ID is already taken. A fixed healthId (seed data) is used as given.
async function withNewHealthId(fixedHealthId, work) {
  if (fixedHealthId) {
    if (!isValidHealthId(fixedHealthId)) throw invalidData(`${fixedHealthId} is not a valid Health ID`);
    return work(fixedHealthId);
  }
  for (let attempt = 1; ; attempt++) {
    try {
      return await work(generateHealthId());
    } catch (err) {
      const clash = err.code === 'P2002' && err.meta?.target?.includes('healthId');
      if (!clash || attempt === HEALTH_ID_ATTEMPTS) throw err;
    }
  }
}

// Creates the patient (with FHIR JSON built from the columns) and their first
// card, inside the caller's transaction.
async function createPatientWithCard(tx, columns, makeSerial) {
  const patient = await tx.patient.create({
    data: { ...columns, fhir: buildFhirPatient(columns) },
  });
  const card = await issueCard(patient.id, { db: tx, makeSerial });
  return { patient, card };
}

// Register a teenager or adult at the registration desk. A NIC is optional;
// if given, the person must be 16 or older and the NIC must fit the record.
// Returns { patient, card, warnings }.
export async function registerPatient(
  data,
  { actor, healthId, today = todayInSriLanka(), makeSerial = generateCardSerial } = {},
) {
  requireActor(actor);
  const columns = cleanDemographics(data, today);
  let warnings = [];

  if (data.nic) {
    if (ageOn(columns.dateOfBirth, today) < NIC_MIN_AGE) {
      throw new AppError('TOO_YOUNG_FOR_NIC', `A NIC can only be linked from age ${NIC_MIN_AGE}`);
    }
    const checked = checkNicAgainstPatient(data.nic, columns);
    columns.nic = checked.nic;
    warnings = checked.warnings;
  }

  try {
    const result = await withNewHealthId(healthId, (newHealthId) =>
      prisma.$transaction(async (tx) => {
        const created = await createPatientWithCard(
          tx,
          { id: randomUUID(), healthId: newHealthId, ...columns },
          makeSerial,
        );
        await writeAudit(
          actor,
          {
            action: 'patient.register',
            patientId: created.patient.id,
            targetType: 'Card',
            targetId: created.card.serial,
            details: { withNic: Boolean(columns.nic), warnings: warnings.map((w) => w.code) },
          },
          tx,
        );
        return created;
      }),
    );
    return { ...result, warnings };
  } catch (err) {
    throw mapNicClash(err);
  }
}

// Register a newborn (or any child under 16) with a guardian, usually at the
// birth hospital. The guardian must already be registered and be 18 or older.
// Child, first card and guardian link are saved in ONE transaction.
// Returns { patient, card, guardianLink }.
export async function registerNewborn(
  { child, guardianHealthId, relationship },
  { actor, healthId, today = todayInSriLanka(), makeSerial = generateCardSerial } = {},
) {
  requireActor(actor);
  const columns = cleanDemographics(child, today);
  if (child.nic) throw invalidData('A child registered with a guardian cannot have a NIC yet');
  if (ageOn(columns.dateOfBirth, today) >= GUARDIAN_ACCESS_ENDS_AT) {
    throw new AppError(
      'TOO_OLD_FOR_GUARDIAN',
      `Only children under ${GUARDIAN_ACCESS_ENDS_AT} are registered with a guardian`,
    );
  }
  if (!RELATIONSHIPS.includes(relationship)) {
    throw invalidData(`Relationship must be one of: ${RELATIONSHIPS.join(', ')}`);
  }

  return withNewHealthId(healthId, (newHealthId) =>
    prisma.$transaction(async (tx) => {
      const guardian = await tx.patient.findUnique({ where: { healthId: guardianHealthId } });
      if (!guardian) throw new AppError('GUARDIAN_NOT_FOUND', `No patient with Health ID ${guardianHealthId}`);
      if (ageOn(guardian.dateOfBirth, today) < GUARDIAN_MIN_AGE) {
        throw new AppError('GUARDIAN_TOO_YOUNG', `A guardian must be ${GUARDIAN_MIN_AGE} or older`);
      }

      const { patient, card } = await createPatientWithCard(
        tx,
        { id: randomUUID(), healthId: newHealthId, ...columns },
        makeSerial,
      );
      const guardianLink = await tx.guardianLink.create({
        data: { childId: patient.id, guardianId: guardian.id, relationship },
      });
      await writeAudit(
        actor,
        {
          action: 'patient.register_newborn',
          patientId: patient.id,
          targetType: 'Card',
          targetId: card.serial,
          details: { guardianPatientId: guardian.id, relationship },
        },
        tx,
      );
      return { patient, card, guardianLink };
    }),
  );
}

// Link a NIC at 16 (DESIGN.md section 1): set the NIC, rebuild the FHIR JSON and
// renew the card (old card REPLACED, new photo), all in ONE transaction.
// Guardian links are NOT touched: guardian access ending at 16 is calculated
// from the date of birth, and the link stays as history.
// Returns { patient, card, warnings } (warnings: e.g. NIC_SEX_MISMATCH for staff to confirm).
export async function linkNic(
  healthId,
  nic,
  { actor, today = todayInSriLanka(), makeSerial = generateCardSerial } = {},
) {
  requireActor(actor);
  try {
    return await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findUnique({ where: { healthId } });
      if (!patient) throw new AppError('PATIENT_NOT_FOUND', `No patient with Health ID ${healthId}`);
      if (patient.nic) {
        throw new AppError('NIC_ALREADY_SET', 'This patient already has a NIC. Changing it is a correction, not a link.');
      }
      if (ageOn(patient.dateOfBirth, today) < NIC_MIN_AGE) {
        throw new AppError('TOO_YOUNG_FOR_NIC', `A NIC can only be linked from age ${NIC_MIN_AGE}`);
      }

      const { nic: normalized, warnings } = checkNicAgainstPatient(nic, patient);
      const updated = await tx.patient.update({
        where: { id: patient.id },
        data: { nic: normalized, fhir: buildFhirPatient({ ...patient, nic: normalized }) },
      });
      // The NIC itself is not copied into the audit row; the patientId is enough
      await writeAudit(
        actor,
        { action: 'patient.link_nic', patientId: patient.id, details: { warnings: warnings.map((w) => w.code) } },
        tx,
      );
      const card = await replaceCard(patient.id, {
        oldStatus: 'REPLACED',
        reason: 'Renewed with new photo when NIC was linked at 16',
        actor,
        makeSerial,
        db: tx,
      });
      return { patient: updated, card, warnings };
    });
  } catch (err) {
    throw mapNicClash(err);
  }
}

// Find a patient by NIC. The NIC is normalized first (same function as when
// saving), so an old NIC like DEMO-NIC-855420159V finds a patient saved as
// DEMO-NIC-198554200159. Returns null if nobody has this NIC.
export async function findPatientByNic(nic) {
  return prisma.patient.findUnique({ where: { nic: normalizeNic(nic) } });
}
