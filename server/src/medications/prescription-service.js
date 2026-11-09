// Electronic Prescription (MedicationRequest), Dispensing (MedicationDispense),
// Scoped Pharmacy Access, and Auto Medication List Engine.
// DESIGN.md sections 3, 5, and 7.

import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { requireActor, writeAudit } from '../audit/audit-log.js';
import { can, PATIENT } from '../auth/permissions.js';
import { verifyClinicalAccess } from '../access/access-service.js';
import { evaluatePrescriptionSafety, resolveDrugInfo } from './safety-engine.js';
import { todayInSriLanka, guardianAccessActive } from '../patients/age.js';

// Generate a random scannable prescription code: DEMO-RX-YYYYMMDD-XXXXXXXX
export function generatePrescriptionCode() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `DEMO-RX-${dateStr}-${rand}`;
}

// Build standard HL7 FHIR R4 MedicationRequest
export function buildFhirMedicationRequest({
  id,
  prescriptionCode,
  patient,
  doctor,
  facility,
  medication,
  dosageInstruction,
  quantity,
  daysSupply,
  repeatsAllowed,
  authoredOn,
  expiresAt,
}) {
  return {
    resourceType: 'MedicationRequest',
    id,
    identifier: [
      {
        system: 'urn:doc365:prescription-code',
        value: prescriptionCode,
      },
    ],
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: {
      coding: [
        {
          system: 'urn:doc365:medication',
          code: medication.code,
          display: medication.name,
        },
      ],
      text: medication.name,
    },
    subject: {
      reference: `Patient/${patient.healthId}`,
      display: patient.fullName ?? `${patient.givenName ?? ''} ${patient.familyName}`.trim(),
    },
    authoredOn: authoredOn.toISOString(),
    requester: {
      reference: `Practitioner/${doctor.id}`,
      display: doctor.fullName,
    },
    performer: {
      reference: `Organization/${facility.code}`,
      display: facility.name,
    },
    dosageInstruction: [
      {
        text: dosageInstruction,
      },
    ],
    dispenseRequest: {
      validityPeriod: {
        end: expiresAt.toISOString(),
      },
      numberOfRepeatsAllowed: repeatsAllowed,
      quantity: {
        value: quantity,
        unit: 'units',
      },
      expectedSupplyDuration: {
        value: daysSupply,
        unit: 'days',
        system: 'http://unitsofmeasure.org',
        code: 'd',
      },
    },
  };
}

// Build standard HL7 FHIR R4 MedicationDispense
export function buildFhirMedicationDispense({
  id,
  prescription,
  patient,
  pharmacist,
  pharmacyFacility,
  quantityDispensed,
  daysSupply,
  dispensedAt,
  notes,
}) {
  return {
    resourceType: 'MedicationDispense',
    id,
    status: 'completed',
    medicationCodeableConcept: {
      coding: [
        {
          system: 'urn:doc365:medication',
          code: prescription.medicationCode,
          display: prescription.medicationName,
        },
      ],
      text: prescription.medicationName,
    },
    subject: {
      reference: `Patient/${patient.healthId}`,
      display: patient.fullName ?? `${patient.givenName ?? ''} ${patient.familyName}`.trim(),
    },
    authorizingPrescription: [
      {
        reference: `MedicationRequest/${prescription.id}`,
        identifier: {
          system: 'urn:doc365:prescription-code',
          value: prescription.prescriptionCode,
        },
      },
    ],
    performer: [
      {
        actor: {
          reference: `Practitioner/${pharmacist.id}`,
          display: pharmacist.fullName,
        },
      },
      {
        actor: {
          reference: `Organization/${pharmacyFacility.code}`,
          display: pharmacyFacility.name,
        },
      },
    ],
    quantity: {
      value: quantityDispensed,
      unit: 'units',
    },
    daysSupply: {
      value: daysSupply,
      unit: 'days',
      system: 'http://unitsofmeasure.org',
      code: 'd',
    },
    whenHandedOver: dispensedAt.toISOString(),
    note: notes ? [{ text: notes }] : undefined,
  };
}

// Internal helper to get active medications without audit log
async function getActiveMedicationsInternal(patientId, db, today = new Date()) {
  // 1. Unexpired dispenses
  const dispenses = await db.medicationDispense.findMany({
    where: { patientId },
    include: { prescription: true, pharmacyFacility: true },
    orderBy: { dispensedAt: 'desc' },
  });

  const activeFromDispenses = [];
  const seenPrescriptionIds = new Set();

  for (const d of dispenses) {
    const expires = new Date(d.dispensedAt.getTime() + d.daysSupply * 24 * 60 * 60 * 1000);
    if (expires >= today) {
      activeFromDispenses.push({
        source: 'DISPENSE',
        dispenseId: d.id,
        prescriptionId: d.prescriptionId,
        medicationCode: d.prescription.medicationCode,
        medicationName: d.prescription.medicationName,
        dosageInstruction: d.prescription.dosageInstruction,
        quantity: d.quantityDispensed,
        daysSupply: d.daysSupply,
        dispensedAt: d.dispensedAt,
        activeUntil: expires,
        pharmacyName: d.pharmacyFacility.name,
      });
      seenPrescriptionIds.add(d.prescriptionId);
    }
  }

  // 2. Pending or partially dispensed prescriptions not yet dispensed or still active
  const activePrescriptions = await db.prescription.findMany({
    where: {
      patientId,
      dispenseState: { in: ['PENDING', 'PARTIALLY_DISPENSED'] },
      expiresAt: { gte: today },
    },
    include: { facility: true, doctor: true },
  });

  const pendingList = [];
  for (const rx of activePrescriptions) {
    if (!seenPrescriptionIds.has(rx.id)) {
      pendingList.push({
        source: 'PRESCRIPTION_PENDING',
        prescriptionId: rx.id,
        prescriptionCode: rx.prescriptionCode,
        medicationCode: rx.medicationCode,
        medicationName: rx.medicationName,
        dosageInstruction: rx.dosageInstruction,
        quantity: rx.quantity,
        daysSupply: rx.daysSupply,
        repeatsRemaining: rx.repeatsRemaining,
        authoredOn: rx.authoredOn,
        doctorName: rx.doctor.fullName,
        facilityName: rx.facility.name,
      });
    }
  }

  return { activeFromDispenses, pendingList };
}

// ---------- 1. Doctor creates signed prescription with safety checks ----------

export async function createPrescription(
  {
    patientHealthId,
    medicationCode,
    medicationName,
    dosageInstruction,
    quantity,
    daysSupply,
    repeatsAllowed = 0,
    validityDays = 30,
    overrideReason = null,
  },
  { actor, db = prisma, today = todayInSriLanka() }
) {
  requireActor(actor);

  if (!can(actor, 'prescription.create')) {
    throw new AppError('FORBIDDEN', 'Only registered doctors may issue prescriptions');
  }

  const patient = await db.patient.findUnique({ where: { healthId: patientHealthId } });
  if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'Patient not found');

  // Three Keys Rule: doctor must have an active AccessGrant for this patient
  await verifyClinicalAccess(patient.id, { actor, db, today });

  // Resolve medication info
  const drugInfo = resolveDrugInfo(medicationCode || medicationName);
  const resolvedName = medicationName || drugInfo.name;
  const resolvedCode = drugInfo.code;

  if (!quantity || quantity <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Prescription quantity must be greater than zero');
  }
  if (!daysSupply || daysSupply <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Prescription daysSupply must be greater than zero');
  }
  if (repeatsAllowed < 0) {
    throw new AppError('VALIDATION_ERROR', 'Repeats allowed cannot be negative');
  }

  // Fetch active medications and documented patient allergies for safety check
  const { activeFromDispenses, pendingList } = await getActiveMedicationsInternal(patient.id, db);
  const activeMeds = [...activeFromDispenses, ...pendingList];

  const allergies = await db.patientAllergy.findMany({
    where: { patientId: patient.id, active: true },
  });

  // Evaluate DDI, duplicate therapy, and allergies
  const safety = evaluatePrescriptionSafety(
    { medicationCode: resolvedCode, medicationName: resolvedName },
    activeMeds,
    allergies,
    overrideReason
  );

  if (!safety.safe) {
    throw new AppError(
      'SAFETY_WARNING',
      'Prescription has critical safety warnings requiring clinical override justification',
      { warnings: safety.warnings }
    );
  }

  const doctor = await db.user.findUnique({ where: { id: actor.userId } });
  const facility = await db.facility.findUnique({ where: { id: actor.facilityId } });

  const prescriptionId = crypto.randomUUID();
  const prescriptionCode = generatePrescriptionCode();
  const authoredOn = new Date();
  const expiresAt = new Date(authoredOn.getTime() + validityDays * 24 * 60 * 60 * 1000);

  const fhirResource = buildFhirMedicationRequest({
    id: prescriptionId,
    prescriptionCode,
    patient,
    doctor,
    facility,
    medication: { code: resolvedCode, name: resolvedName },
    dosageInstruction,
    quantity,
    daysSupply,
    repeatsAllowed,
    authoredOn,
    expiresAt,
  });

  const prescription = await db.prescription.create({
    data: {
      id: prescriptionId,
      prescriptionCode,
      patientId: patient.id,
      facilityId: actor.facilityId,
      doctorId: actor.userId,
      medicationCode: resolvedCode,
      medicationName: resolvedName,
      dosageInstruction,
      quantity,
      daysSupply,
      repeatsAllowed,
      repeatsRemaining: repeatsAllowed,
      quantityDispensedTotal: 0,
      dispenseState: 'PENDING',
      fhir: fhirResource,
      overrideReason: safety.overrideReason ?? null,
      authoredOn,
      expiresAt,
    },
  });

  await writeAudit(
    actor,
    {
      action: 'prescription.create',
      patientId: patient.id,
      targetType: 'Prescription',
      targetId: prescription.id,
      details: {
        prescriptionCode,
        medicationCode: resolvedCode,
        overridden: safety.overridden,
        warningsCount: safety.warnings.length,
      },
    },
    db
  );

  return {
    prescription,
    qrPayload: prescription.prescriptionCode,
    warnings: safety.warnings,
    overridden: safety.overridden,
  };
}

// ---------- 2. Scoped Pharmacy Scan (Strictly limited payload) ----------

export async function getScannedPrescription(prescriptionCode, { actor, db = prisma }) {
  requireActor(actor);

  if (!can(actor, 'prescription.view_scanned')) {
    throw new AppError('FORBIDDEN', 'Only registered pharmacists may scan prescriptions');
  }

  const prescription = await db.prescription.findUnique({
    where: { prescriptionCode },
    include: {
      patient: true,
      facility: true,
      doctor: true,
      dispenses: {
        include: { pharmacyFacility: true, pharmacistUser: true },
        orderBy: { dispensedAt: 'desc' },
      },
    },
  });

  if (!prescription) {
    throw new AppError('NOT_FOUND', 'Prescription not found');
  }

  // Update expired state if past expiry
  if (new Date() > prescription.expiresAt && prescription.dispenseState === 'PENDING') {
    await db.prescription.update({
      where: { id: prescription.id },
      data: { dispenseState: 'EXPIRED' },
    });
    prescription.dispenseState = 'EXPIRED';
  }

  await writeAudit(
    actor,
    {
      action: 'prescription.scan',
      patientId: prescription.patientId,
      targetType: 'Prescription',
      targetId: prescription.id,
      details: { prescriptionCode, dispenseState: prescription.dispenseState },
    },
    db
  );

  // Scoped view: strictly the prescription payload and minimal patient demographics for dispensing
  return {
    prescription: {
      id: prescription.id,
      prescriptionCode: prescription.prescriptionCode,
      dispenseState: prescription.dispenseState,
      medicationCode: prescription.medicationCode,
      medicationName: prescription.medicationName,
      dosageInstruction: prescription.dosageInstruction,
      quantity: prescription.quantity,
      daysSupply: prescription.daysSupply,
      repeatsAllowed: prescription.repeatsAllowed,
      repeatsRemaining: prescription.repeatsRemaining,
      quantityDispensedTotal: prescription.quantityDispensedTotal,
      authoredOn: prescription.authoredOn,
      expiresAt: prescription.expiresAt,
      overrideReason: prescription.overrideReason,
    },
    prescriber: {
      doctorName: prescription.doctor.fullName,
      facilityName: prescription.facility.name,
      facilityCode: prescription.facility.code,
    },
    patient: {
      healthId: prescription.patient.healthId,
      fullName: prescription.patient.fullName ?? `${prescription.patient.givenName ?? ''} ${prescription.patient.familyName}`.trim(),
      dateOfBirth: prescription.patient.dateOfBirth.toISOString().slice(0, 10),
      sex: prescription.patient.sex,
    },
    dispenseHistory: prescription.dispenses.map((d) => ({
      id: d.id,
      quantityDispensed: d.quantityDispensed,
      daysSupply: d.daysSupply,
      dispensedAt: d.dispensedAt,
      pharmacyName: d.pharmacyFacility.name,
      pharmacistName: d.pharmacistUser.fullName,
      notes: d.notes,
    })),
  };
}

// ---------- 3. Pharmacy Dispense with Re-use Prevention ----------

export async function dispensePrescription(
  prescriptionCode,
  { quantityDispensed, daysSupply, notes },
  { actor, db = prisma }
) {
  requireActor(actor);

  if (!can(actor, 'prescription.dispense')) {
    throw new AppError('FORBIDDEN', 'Only registered pharmacists may dispense prescriptions');
  }

  const prescription = await db.prescription.findUnique({
    where: { prescriptionCode },
    include: { patient: true },
  });

  if (!prescription) {
    throw new AppError('NOT_FOUND', 'Prescription not found');
  }

  // Re-use prevention & state validation
  if (prescription.dispenseState === 'DISPENSED') {
    throw new AppError(
      'PRESCRIPTION_ALREADY_DISPENSED',
      'This prescription has already been fully dispensed and cannot be reused',
      409
    );
  }

  if (prescription.dispenseState === 'CANCELLED') {
    throw new AppError('PRESCRIPTION_CANCELLED', 'This prescription has been cancelled by the prescriber', 400);
  }

  if (new Date() > prescription.expiresAt) {
    await db.prescription.update({
      where: { id: prescription.id },
      data: { dispenseState: 'EXPIRED' },
    });
    throw new AppError('PRESCRIPTION_EXPIRED', 'This prescription has expired and cannot be dispensed', 400);
  }

  const actualQuantity = quantityDispensed ?? prescription.quantity;
  const actualDaysSupply = daysSupply ?? prescription.daysSupply;

  if (actualQuantity <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Dispensed quantity must be greater than zero');
  }
  if (actualDaysSupply <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Days supply must be greater than zero');
  }

  const pharmacist = await db.user.findUnique({ where: { id: actor.userId } });
  const pharmacyFacility = await db.facility.findUnique({ where: { id: actor.facilityId } });

  const dispenseId = crypto.randomUUID();
  const dispensedAt = new Date();

  // Determine new dispense state and repeats remaining
  let newDispenseState = 'DISPENSED';
  let newRepeatsRemaining = prescription.repeatsRemaining;

  if (prescription.dispenseState === 'PENDING') {
    // Initial fill
    if (prescription.repeatsRemaining > 0) {
      newDispenseState = 'PARTIALLY_DISPENSED';
      newRepeatsRemaining = prescription.repeatsRemaining;
    } else {
      newDispenseState = 'DISPENSED';
      newRepeatsRemaining = 0;
    }
  } else if (prescription.dispenseState === 'PARTIALLY_DISPENSED') {
    // Refill fill
    newRepeatsRemaining = Math.max(0, prescription.repeatsRemaining - 1);
    newDispenseState = newRepeatsRemaining === 0 ? 'DISPENSED' : 'PARTIALLY_DISPENSED';
  }

  const fhirDispense = buildFhirMedicationDispense({
    id: dispenseId,
    prescription,
    patient: prescription.patient,
    pharmacist,
    pharmacyFacility,
    quantityDispensed: actualQuantity,
    daysSupply: actualDaysSupply,
    dispensedAt,
    notes,
  });

  const [dispense, updatedPrescription] = await db.$transaction([
    db.medicationDispense.create({
      data: {
        id: dispenseId,
        prescriptionId: prescription.id,
        patientId: prescription.patientId,
        pharmacyFacilityId: actor.facilityId,
        pharmacistUserId: actor.userId,
        quantityDispensed: actualQuantity,
        daysSupply: actualDaysSupply,
        notes: notes ?? null,
        fhir: fhirDispense,
        dispensedAt,
      },
    }),
    db.prescription.update({
      where: { id: prescription.id },
      data: {
        dispenseState: newDispenseState,
        repeatsRemaining: newRepeatsRemaining,
        quantityDispensedTotal: { increment: actualQuantity },
      },
    }),
  ]);

  await writeAudit(
    actor,
    {
      action: 'prescription.dispense',
      patientId: prescription.patientId,
      targetType: 'MedicationDispense',
      targetId: dispense.id,
      details: {
        prescriptionCode,
        quantityDispensed: actualQuantity,
        dispenseState: newDispenseState,
        repeatsRemaining: newRepeatsRemaining,
      },
    },
    db
  );

  return {
    dispense,
    prescription: {
      id: updatedPrescription.id,
      prescriptionCode: updatedPrescription.prescriptionCode,
      dispenseState: updatedPrescription.dispenseState,
      repeatsRemaining: updatedPrescription.repeatsRemaining,
      quantityDispensedTotal: updatedPrescription.quantityDispensedTotal,
    },
  };
}

// ---------- 4. Auto Medication List Engine ----------

export async function getActiveMedicationList(patientHealthId, { actor, db = prisma, today = new Date() } = {}) {
  requireActor(actor);

  const patient = await db.patient.findUnique({ where: { healthId: patientHealthId } });
  if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'Patient not found');

  // Access check
  if (actor.role === PATIENT) {
    if (actor.ownPatientId !== patient.id) {
      const link = await db.guardianLink.findFirst({
        where: { childId: patient.id, guardianId: actor.ownPatientId },
        include: { child: true },
      });
      if (!link || !guardianAccessActive(link.child.dateOfBirth, todayInSriLanka(today))) {
        throw new AppError('FORBIDDEN', 'Only the patient or active guardian may view active medications');
      }
    }
  } else if (actor.role !== 'DOCTOR' && actor.role !== 'HOSPITAL_STAFF' && actor.role !== 'PHARMACIST') {
    throw new AppError('FORBIDDEN', 'Insufficient permissions to view medication list');
  }

  const { activeFromDispenses, pendingList } = await getActiveMedicationsInternal(patient.id, db, today);

  await writeAudit(
    actor,
    {
      action: 'medication.view_active',
      patientId: patient.id,
      targetType: 'Patient',
      targetId: patient.healthId,
      details: { activeCount: activeFromDispenses.length + pendingList.length },
    },
    db
  );

  return {
    patient: {
      healthId: patient.healthId,
      name: patient.fullName ?? `${patient.givenName ?? ''} ${patient.familyName}`.trim(),
    },
    activeMedications: activeFromDispenses.map((d) => ({
      status: 'ACTIVE_TAKING',
      medicationCode: d.medicationCode,
      medicationName: d.medicationName,
      dosageInstruction: d.dosageInstruction,
      quantity: d.quantity,
      daysSupply: d.daysSupply,
      dispensedAt: d.dispensedAt,
      activeUntil: d.activeUntil,
      pharmacyName: d.pharmacyName,
    })),
    pendingPrescriptions: pendingList.map((p) => ({
      status: 'PENDING_DISPENSE',
      prescriptionCode: p.prescriptionCode,
      medicationCode: p.medicationCode,
      medicationName: p.medicationName,
      dosageInstruction: p.dosageInstruction,
      quantity: p.quantity,
      daysSupply: p.daysSupply,
      repeatsRemaining: p.repeatsRemaining,
      prescribedBy: p.doctorName,
      facilityName: p.facilityName,
      authoredOn: p.authoredOn,
    })),
  };
}

// ---------- 5. Documented Patient Allergies ----------

export async function recordPatientAllergy(
  patientHealthId,
  { substance, severity = 'MODERATE', reaction },
  { actor, db = prisma }
) {
  requireActor(actor);

  if (actor.role !== 'DOCTOR' && actor.role !== 'HOSPITAL_STAFF' && actor.role !== PATIENT) {
    throw new AppError('FORBIDDEN', 'Only doctors, clinical staff, or the patient may record allergies');
  }

  const patient = await db.patient.findUnique({ where: { healthId: patientHealthId } });
  if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'Patient not found');

  if (actor.role === PATIENT && actor.ownPatientId !== patient.id) {
    const link = await db.guardianLink.findFirst({
      where: { childId: patient.id, guardianId: actor.ownPatientId },
      include: { child: true },
    });
    if (!link || !guardianAccessActive(link.child.dateOfBirth, todayInSriLanka())) {
      throw new AppError('FORBIDDEN', 'Only the patient or active guardian may record allergies');
    }
  }

  if (!substance || typeof substance !== 'string' || substance.trim().length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Allergy substance is required');
  }

  const allergy = await db.patientAllergy.create({
    data: {
      patientId: patient.id,
      substance: substance.trim().toUpperCase(),
      severity,
      reaction: reaction ?? null,
      recordedByUserId: actor.userId,
    },
  });

  await writeAudit(
    actor,
    {
      action: 'allergy.record',
      patientId: patient.id,
      targetType: 'PatientAllergy',
      targetId: allergy.id,
      details: { substance: allergy.substance, severity: allergy.severity },
    },
    db
  );

  return allergy;
}
