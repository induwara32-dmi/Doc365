// Clinical record intake, verification, append-only versioning, and integrity checks.
// The server NEVER signs on behalf of a facility (DESIGN.md section 4).
// It verifies the facility's signature using the facility's public key from the database.
// Stored rows are append-only. Every read verifies the signature again: if a row was
// changed directly in the database, it shows as TAMPERED.

import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { canonicalize } from '../core/canonicalize.js';
import { TRUST } from '../core/verify.js';
import { requireActor, writeAudit } from '../audit/audit-log.js';
import { can, PATIENT } from '../auth/permissions.js';

export function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function bundleSha256(bundle) {
  return sha256Hex(canonicalize(bundle));
}

// Extracts the patient's Health ID from the bundle (Patient resource)
export function extractPatientHealthId(bundle) {
  const patientResource = bundle?.entry?.find((e) => e.resource?.resourceType === 'Patient')?.resource;
  if (!patientResource) return null;
  const phnId = patientResource.identifier?.find((i) => i.system === 'urn:doc365:demo-phn');
  if (phnId?.value) return phnId.value;
  const demoId = patientResource.identifier?.find((i) => typeof i.value === 'string' && i.value.startsWith('DEMO-'));
  if (demoId?.value) return demoId.value;
  return patientResource.identifier?.[0]?.value ?? null;
}

// Extracts the main clinical resource from the bundle (e.g. "DiagnosticReport/report-0001")
export function extractMainResource(bundle, provenance) {
  const targetRef = provenance?.target?.[0]?.reference;
  if (targetRef) return targetRef;

  const mainTypes = ['DiagnosticReport', 'MedicationRequest', 'DocumentReference', 'Composition'];
  const mainEntry = bundle?.entry?.find((e) => mainTypes.includes(e.resource?.resourceType));
  if (mainEntry?.resource?.id) {
    return `${mainEntry.resource.resourceType}/${mainEntry.resource.id}`;
  }
  const first = bundle?.entry?.[0]?.resource;
  if (first?.resourceType && first?.id) {
    return `${first.resourceType}/${first.id}`;
  }
  return `Bundle/${bundle?.id ?? 'unknown'}`;
}

// Normalizes status string to match Prisma / PostgreSQL RecordStatus enum
export function normalizeStatus(status) {
  if (status === 'entered-in-error' || status === 'entered_in_error') {
    return 'entered_in_error';
  }
  if (status === 'amended') return 'amended';
  return 'final';
}

// Extracts status from bundle's DiagnosticReport or returns 'final'
export function extractStatus(bundle) {
  const report = bundle?.entry?.find((e) => e.resource?.resourceType === 'DiagnosticReport')?.resource;
  return normalizeStatus(report?.status);
}

// Verifies the Provenance signature against the signing facility's public key in the database
export async function verifyProvenanceSignature(bundle, provenance, db = prisma) {
  if (!provenance || !provenance.signature || provenance.signature.length === 0) {
    return { status: TRUST.PATIENT_UPLOADED, reason: 'No lab signature. Treat as unverified.' };
  }

  const sig = provenance.signature[0];
  const signerRef = sig.who?.reference;
  if (!signerRef) {
    return { status: TRUST.UNKNOWN_SIGNER, reason: 'Missing signer reference in provenance' };
  }

  const facilityCode = signerRef.replace(/^Organization\//, '');
  const facility = await db.facility.findUnique({ where: { code: facilityCode } });

  if (!facility || !facility.publicKeyPem) {
    return {
      status: TRUST.UNKNOWN_SIGNER,
      reason: `${signerRef} is not a registered facility or has no public key.`,
      facility: null,
    };
  }

  try {
    const bytes = Buffer.from(canonicalize(bundle), 'utf8');
    const publicKey = crypto.createPublicKey(facility.publicKeyPem);
    const ok = crypto.verify(null, bytes, publicKey, Buffer.from(sig.data, 'base64'));

    return ok
      ? { status: TRUST.VERIFIED, reason: `Signed by ${facility.name}. Data unchanged.`, facility }
      : { status: TRUST.TAMPERED, reason: 'Signature does not match. Data was changed after signing.', facility };
  } catch (err) {
    return { status: TRUST.TAMPERED, reason: `Signature verification error: ${err.message}`, facility };
  }
}

// Upload a new clinical record (version 1).
export async function createRecord({ bundle, provenance }, { actor, db = prisma }) {
  requireActor(actor);

  if (!bundle || typeof bundle !== 'object') {
    throw new AppError('INVALID_BUNDLE', 'A valid FHIR bundle is required');
  }

  const healthId = extractPatientHealthId(bundle);
  if (!healthId) {
    throw new AppError('INVALID_BUNDLE', 'The bundle must contain a Patient with a Health ID');
  }

  const patient = await db.patient.findUnique({ where: { healthId } });
  if (!patient) {
    throw new AppError('PATIENT_NOT_FOUND', 'No patient with this Health ID');
  }

  let source;
  let signingFacility = null;
  let signingKeyFingerprint = null;

  if (provenance) {
    source = 'FACILITY_SIGNED';
    if (!actor.facilityId || !actor.membershipId) {
      throw new AppError('FORBIDDEN', 'Patients cannot upload facility-signed records');
    }

    const verification = await verifyProvenanceSignature(bundle, provenance, db);

    if (verification.status === TRUST.UNKNOWN_SIGNER) {
      await writeAudit(actor, {
        action: 'record.rejected',
        patientId: patient.id,
        reason: 'UNKNOWN_SIGNER',
        details: { message: verification.reason },
      }, db);
      throw new AppError('UNKNOWN_SIGNER', verification.reason);
    }

    if (verification.status === TRUST.TAMPERED) {
      await writeAudit(actor, {
        action: 'record.rejected',
        patientId: patient.id,
        reason: 'TAMPERED',
        details: { message: verification.reason },
      }, db);
      throw new AppError('TAMPERED_RECORD', verification.reason);
    }

    if (verification.status !== TRUST.VERIFIED) {
      await writeAudit(actor, {
        action: 'record.rejected',
        patientId: patient.id,
        reason: verification.status,
        details: { message: verification.reason },
      }, db);
      throw new AppError('INVALID_SIGNATURE', verification.reason);
    }

    if (verification.facility.id !== actor.facilityId) {
      await writeAudit(actor, {
        action: 'record.rejected',
        patientId: patient.id,
        reason: 'FACILITY_MISMATCH',
        details: {
          signingFacilityId: verification.facility.id,
          actorFacilityId: actor.facilityId,
        },
      }, db);
      throw new AppError('FACILITY_MISMATCH', 'Signing facility does not match your facility membership');
    }

    signingFacility = verification.facility;
    signingKeyFingerprint = sha256Hex(signingFacility.publicKeyPem);
  } else {
    source = 'PATIENT_UPLOADED';
    if (actor.role !== PATIENT) {
      throw new AppError('SIGNATURE_REQUIRED', 'Staff uploads must be signed by the facility');
    }
    if (patient.id !== actor.ownPatientId) {
      throw new AppError('FORBIDDEN', 'Patients may only upload records to their own record');
    }
  }

  const hash = bundleSha256(bundle);
  if (source === 'FACILITY_SIGNED') {
    const existing = await db.clinicalRecord.findFirst({
      where: { facilityId: signingFacility.id, bundleSha256: hash },
    });
    if (existing) {
      throw new AppError('DUPLICATE_RECORD', 'This exact record has already been uploaded by this facility');
    }
  }

  const mainResource = extractMainResource(bundle, provenance);
  const status = extractStatus(bundle);
  const id = crypto.randomUUID();

  const executeCreate = async (tx) => {
    const record = await tx.clinicalRecord.create({
      data: {
        id,
        lineageId: id, // version 1 lineageId = id (enforced by CHECK ClinicalRecord_version_chain)
        version: 1,
        previousVersionId: null,
        patientId: patient.id,
        source,
        status,
        mainResource,
        facilityId: signingFacility?.id ?? null,
        uploadedByUserId: actor.userId,
        uploadedByMembershipId: actor.membershipId ?? null,
        bundle,
        provenance: provenance ?? Prisma.DbNull,
        bundleSha256: hash,
        signingKeyFingerprint,
      },
    });

    await writeAudit(actor, {
      action: 'record.create',
      patientId: patient.id,
      targetType: 'ClinicalRecord',
      targetId: record.id,
      details: { source, mainResource, version: 1 },
    }, tx);

    return record;
  };

  const record = db === prisma ? await prisma.$transaction(executeCreate) : await executeCreate(db);

  return {
    record,
    trust: {
      status: source === 'PATIENT_UPLOADED' ? TRUST.PATIENT_UPLOADED : TRUST.VERIFIED,
      reason: source === 'PATIENT_UPLOADED'
        ? 'Patient upload. Treat as unverified.'
        : `Signed by ${signingFacility.name}. Data unchanged.`,
    },
  };
}

// Correct an existing record (amended or entered-in-error). Creates a new version.
export async function correctRecord(previousRecordId, { bundle, provenance, status: requestedStatus }, { actor, db = prisma }) {
  requireActor(actor);

  if (!bundle || typeof bundle !== 'object') {
    throw new AppError('INVALID_BUNDLE', 'A valid FHIR bundle is required');
  }

  const previous = await db.clinicalRecord.findUnique({ where: { id: previousRecordId } });
  if (!previous) {
    throw new AppError('RECORD_NOT_FOUND', 'Record not found');
  }

  const alreadyCorrected = await db.clinicalRecord.findUnique({
    where: { previousVersionId: previous.id },
  });
  if (alreadyCorrected) {
    throw new AppError('RECORD_ALREADY_AMENDED', 'This record version has already been corrected');
  }

  if (!can(actor, 'record.correct', { facilityId: previous.facilityId, uploadedByUserId: previous.uploadedByUserId })) {
    throw new AppError('FORBIDDEN', 'You do not have permission to correct this record');
  }

  if (!provenance) {
    throw new AppError('SIGNATURE_REQUIRED', 'Corrections must be signed by the facility');
  }

  const verification = await verifyProvenanceSignature(bundle, provenance, db);

  if (verification.status === TRUST.UNKNOWN_SIGNER) {
    await writeAudit(actor, {
      action: 'record.rejected',
      patientId: previous.patientId,
      reason: 'UNKNOWN_SIGNER',
      details: { message: verification.reason },
    }, db);
    throw new AppError('UNKNOWN_SIGNER', verification.reason);
  }

  if (verification.status === TRUST.TAMPERED) {
    await writeAudit(actor, {
      action: 'record.rejected',
      patientId: previous.patientId,
      reason: 'TAMPERED',
      details: { message: verification.reason },
    }, db);
    throw new AppError('TAMPERED_RECORD', verification.reason);
  }

  if (verification.status !== TRUST.VERIFIED) {
    await writeAudit(actor, {
      action: 'record.rejected',
      patientId: previous.patientId,
      reason: verification.status,
      details: { message: verification.reason },
    }, db);
    throw new AppError('INVALID_SIGNATURE', verification.reason);
  }

  if (verification.facility.id !== previous.facilityId) {
    await writeAudit(actor, {
      action: 'record.rejected',
      patientId: previous.patientId,
      reason: 'FACILITY_MISMATCH',
      details: {
        signingFacilityId: verification.facility.id,
        originalFacilityId: previous.facilityId,
      },
    }, db);
    throw new AppError('FACILITY_MISMATCH', 'Corrections must be signed by the facility that created the original record');
  }

  if (verification.facility.id !== actor.facilityId) {
    await writeAudit(actor, {
      action: 'record.rejected',
      patientId: previous.patientId,
      reason: 'FACILITY_MISMATCH',
      details: {
        signingFacilityId: verification.facility.id,
        actorFacilityId: actor.facilityId,
      },
    }, db);
    throw new AppError('FACILITY_MISMATCH', 'Signing facility does not match your facility membership');
  }

  const status = normalizeStatus(requestedStatus ?? extractStatus(bundle));
  if (status !== 'amended' && status !== 'entered_in_error') {
    throw new AppError('INVALID_STATUS', 'Correction status must be amended or entered-in-error');
  }

  const healthId = extractPatientHealthId(bundle);
  const patient = await db.patient.findUnique({ where: { healthId } });
  if (!patient || patient.id !== previous.patientId) {
    throw new AppError('INVALID_BUNDLE', 'Corrected bundle patient must match the original record patient');
  }

  const hash = bundleSha256(bundle);
  const newId = crypto.randomUUID();

  const executeCorrect = async (tx) => {
    const newRecord = await tx.clinicalRecord.create({
      data: {
        id: newId,
        lineageId: previous.lineageId,
        version: previous.version + 1,
        previousVersionId: previous.id,
        patientId: previous.patientId,
        source: 'FACILITY_SIGNED',
        status,
        mainResource: previous.mainResource,
        facilityId: previous.facilityId,
        uploadedByUserId: actor.userId,
        uploadedByMembershipId: actor.membershipId,
        bundle,
        provenance,
        bundleSha256: hash,
        signingKeyFingerprint: sha256Hex(verification.facility.publicKeyPem),
      },
    });

    await writeAudit(actor, {
      action: 'record.correct',
      patientId: previous.patientId,
      targetType: 'ClinicalRecord',
      targetId: newRecord.id,
      details: {
        lineageId: previous.lineageId,
        version: newRecord.version,
        previousVersionId: previous.id,
        status,
      },
    }, tx);

    return newRecord;
  };

  const newRecord = db === prisma ? await prisma.$transaction(executeCorrect) : await executeCorrect(db);

  return {
    record: newRecord,
    trust: {
      status: TRUST.VERIFIED,
      reason: `Signed by ${verification.facility.name}. Data unchanged.`,
    },
  };
}

// Verifies the integrity of a stored record on read.
// If someone tampered with the record directly in the database, this returns TAMPERED.
export async function verifyRecordIntegrity(record, db = prisma) {
  if (record.source === 'PATIENT_UPLOADED') {
    return {
      status: TRUST.PATIENT_UPLOADED,
      reason: 'Patient upload: no lab signature. Treat as unverified.',
    };
  }

  if (!record.facilityId) {
    return { status: TRUST.UNKNOWN_SIGNER, reason: 'No facility associated with record' };
  }

  const facility = await db.facility.findUnique({ where: { id: record.facilityId } });
  if (!facility || !facility.publicKeyPem) {
    return { status: TRUST.UNKNOWN_SIGNER, reason: 'Facility or public key not found' };
  }

  // Check stored SHA-256 against canonicalized bundle
  const currentHash = bundleSha256(record.bundle);
  if (currentHash !== record.bundleSha256) {
    return { status: TRUST.TAMPERED, reason: 'Bundle hash does not match stored hash (tampered in database)' };
  }

  try {
    const bytes = Buffer.from(canonicalize(record.bundle), 'utf8');
    const publicKey = crypto.createPublicKey(facility.publicKeyPem);
    const sig = record.provenance?.signature?.[0];
    if (!sig?.data) {
      return { status: TRUST.TAMPERED, reason: 'Missing signature in stored provenance' };
    }
    const ok = crypto.verify(null, bytes, publicKey, Buffer.from(sig.data, 'base64'));
    return ok
      ? { status: TRUST.VERIFIED, reason: `Signed by ${facility.name}. Data unchanged.` }
      : { status: TRUST.TAMPERED, reason: 'Signature does not match bundle data (tampered in database)' };
  } catch (err) {
    return { status: TRUST.TAMPERED, reason: `Verification error: ${err.message}` };
  }
}

// Retrieves a record by ID and checks its integrity.
export async function getRecordById(id, { actor, db = prisma } = {}) {
  const record = await db.clinicalRecord.findUnique({ where: { id } });
  if (!record) throw new AppError('RECORD_NOT_FOUND', 'Record not found');

  if (actor) {
    if (actor.role === 'LAB_STAFF' && record.facilityId !== actor.facilityId) {
      throw new AppError('FORBIDDEN', 'You may only view records from your own lab');
    }
    if (actor.role === PATIENT && record.patientId !== actor.ownPatientId) {
      throw new AppError('FORBIDDEN', 'You may only view your own records');
    }
  }

  const trust = await verifyRecordIntegrity(record, db);
  return { record, trust };
}

// Retrieves the full version history for a lineage (oldest to newest).
export async function getRecordHistory(lineageId, { actor, db = prisma } = {}) {
  const versions = await db.clinicalRecord.findMany({
    where: { lineageId },
    orderBy: { version: 'asc' },
  });

  if (versions.length === 0) {
    throw new AppError('RECORD_NOT_FOUND', 'Record lineage not found');
  }

  if (actor) {
    const first = versions[0];
    if (actor.role === 'LAB_STAFF' && first.facilityId !== actor.facilityId) {
      throw new AppError('FORBIDDEN', 'You may only view records from your own lab');
    }
    if (actor.role === PATIENT && first.patientId !== actor.ownPatientId) {
      throw new AppError('FORBIDDEN', 'You may only view your own records');
    }
  }

  const verifiedVersions = await Promise.all(
    versions.map(async (v) => {
      const trust = await verifyRecordIntegrity(v, db);
      return { ...v, trust };
    })
  );

  return { lineageId, versions: verifiedVersions };
}

// Retrieves all records for a patient (with their verified trust status).
export async function getPatientRecords(patientId, { actor, db = prisma } = {}) {
  const records = await db.clinicalRecord.findMany({
    where: { patientId },
    orderBy: { createdAt: 'desc' },
  });

  const filtered = actor?.role === 'LAB_STAFF'
    ? records.filter((r) => r.facilityId === actor.facilityId)
    : records;

  return Promise.all(
    filtered.map(async (r) => {
      const trust = await verifyRecordIntegrity(r, db);
      return { ...r, trust };
    })
  );
}
