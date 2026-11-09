// Laboratory Orders (FHIR ServiceRequest) lifecycle management and result linking.
// Issued by doctors during consultations, fulfilled by laboratory staff (MLTs).
// DESIGN.md sections 4, 5, and 7.

import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { requireActor, writeAudit } from '../audit/audit-log.js';
import { verifyClinicalAccess } from '../access/access-service.js';
import { guardianAccessActive } from '../patients/age.js';

// Generate a random order code: ORD-YYYY-XXXXXX
export function generateOrderCode() {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${year}-${rand}`;
}

// Build standard HL7 FHIR R4 ServiceRequest
export function buildFhirServiceRequest({
  id,
  orderCode,
  patient,
  doctor,
  facility,
  testCode,
  testName,
  priority,
  clinicalNotes,
  orderedAt,
}) {
  return {
    resourceType: 'ServiceRequest',
    id,
    identifier: [
      {
        system: 'urn:doc365:order-code',
        value: orderCode,
      },
    ],
    status: 'active',
    intent: 'order',
    priority: priority.toLowerCase(),
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: testCode,
          display: testName,
        },
      ],
      text: testName,
    },
    subject: {
      reference: `Patient/${patient.healthId}`,
      display: patient.fullName ?? `${patient.givenName ?? ''} ${patient.familyName}`.trim(),
    },
    requester: {
      reference: `Practitioner/${doctor.id}`,
      display: doctor.fullName,
    },
    performer: [
      {
        reference: `Organization/${facility.code}`,
        display: facility.name,
      },
    ],
    authoredOn: orderedAt.toISOString(),
    note: clinicalNotes ? [{ text: clinicalNotes }] : undefined,
  };
}

/**
 * Doctor creates a new LabOrder (FHIR ServiceRequest)
 */
export function createLabOrder(
  { patientHealthId, testCode, testName, priority = 'ROUTINE', clinicalNotes },
  { actor },
) {
  requireActor(actor);

  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({
      where: { healthId: patientHealthId },
    });
    if (!patient) {
      throw new AppError('PATIENT_NOT_FOUND', `Patient with Health ID ${patientHealthId} not found`);
    }

    // Three Keys Rule: doctor must hold an active AccessGrant at their facility
    await verifyClinicalAccess(patient.id, { actor, db: tx });

    const doctor = await tx.user.findUnique({
      where: { id: actor.userId },
    });
    if (!doctor) throw new AppError('NOT_FOUND', 'Doctor user not found');

    const facility = await tx.facility.findUnique({
      where: { id: actor.facilityId },
    });
    if (!facility) throw new AppError('NOT_FOUND', 'Facility not found');

    const orderId = crypto.randomUUID();
    const orderCode = generateOrderCode();
    const orderedAt = new Date();

    const normalizedPriority = ['ROUTINE', 'URGENT', 'STAT'].includes(priority?.toUpperCase())
      ? priority.toUpperCase()
      : 'ROUTINE';

    const fhir = buildFhirServiceRequest({
      id: orderId,
      orderCode,
      patient,
      doctor,
      facility,
      testCode,
      testName,
      priority: normalizedPriority,
      clinicalNotes,
      orderedAt,
    });

    const order = await tx.labOrder.create({
      data: {
        id: orderId,
        orderCode,
        patientId: patient.id,
        facilityId: facility.id,
        doctorId: doctor.id,
        testCode,
        testName,
        priority: normalizedPriority,
        status: 'ORDERED',
        clinicalNotes: clinicalNotes?.trim() || null,
        fhir,
        orderedAt,
      },
      include: {
        doctor: { select: { id: true, fullName: true } },
        facility: { select: { id: true, name: true, code: true } },
      },
    });

    await writeAudit(
      actor,
      {
        patientId: patient.id,
        action: 'lab_order.create',
        targetType: 'LabOrder',
        targetId: orderId,
        details: {
          orderCode,
          testCode,
          testName,
          priority: normalizedPriority,
        },
      },
      tx,
    );

    return { order };
  });
}

/**
 * Retrieve lab orders for a patient
 */
export async function getPatientLabOrders(patientHealthId, { status } = {}, { actor }) {
  requireActor(actor);

  const patient = await prisma.patient.findUnique({
    where: { healthId: patientHealthId },
  });
  if (!patient) {
    throw new AppError('PATIENT_NOT_FOUND', `Patient with Health ID ${patientHealthId} not found`);
  }

  // Access check: patient or legal guardian
  if (actor.role === 'PATIENT') {
    let allowed = false;
    const actorPatientId = actor.ownPatientId ?? actor.patientId;
    if (actorPatientId === patient.id) {
      allowed = true;
    } else if (actorPatientId) {
      const guardian = await prisma.guardianLink.findFirst({
        where: { childId: patient.id, guardianId: actorPatientId },
      });
      if (guardian && guardianAccessActive(patient.dateOfBirth)) {
        allowed = true;
      }
    }
    if (!allowed) {
      throw new AppError('FORBIDDEN', 'Access to patient lab orders denied');
    }
  }

  const where = {
    patientId: patient.id,
    ...(status ? { status } : {}),
  };

  const orders = await prisma.labOrder.findMany({
    where,
    include: {
      doctor: { select: { id: true, fullName: true } },
      facility: { select: { id: true, name: true, code: true } },
      resultRecord: {
        select: {
          id: true,
          bundleSha256: true,
          source: true,
          status: true,
          createdAt: true,
          bundle: true,
        },
      },
    },
    orderBy: { orderedAt: 'desc' },
  });

  return { orders };
}

/**
 * Retrieve a single lab order by ID or orderCode
 */
export async function getLabOrderById(orderId, { actor }) {
  requireActor(actor);

  const order = await prisma.labOrder.findFirst({
    where: {
      OR: [{ id: orderId }, { orderCode: orderId }],
    },
    include: {
      patient: true,
      doctor: { select: { id: true, fullName: true } },
      facility: { select: { id: true, name: true, code: true } },
      resultRecord: {
        select: {
          id: true,
          bundleSha256: true,
          source: true,
          status: true,
          createdAt: true,
          bundle: true,
        },
      },
    },
  });

  if (!order) {
    throw new AppError('NOT_FOUND', `Lab order ${orderId} not found`);
  }

  return { order };
}

/**
 * Complete a lab order, linking to the uploaded ClinicalRecord result
 */
export function completeLabOrder(orderId, { resultRecordId } = {}, { actor }) {
  requireActor(actor);

  return prisma.$transaction(async (tx) => {
    const order = await tx.labOrder.findFirst({
      where: {
        OR: [{ id: orderId }, { orderCode: orderId }],
      },
    });

    if (!order) {
      throw new AppError('NOT_FOUND', `Lab order ${orderId} not found`);
    }

    if (order.status === 'COMPLETED') {
      throw new AppError('ORDER_ALREADY_COMPLETED', `Lab order ${order.orderCode} is already completed`);
    }

    if (order.status === 'CANCELLED') {
      throw new AppError('ORDER_CANCELLED', `Lab order ${order.orderCode} was cancelled`);
    }

    if (resultRecordId) {
      const record = await tx.clinicalRecord.findUnique({
        where: { id: resultRecordId },
      });
      if (!record) {
        throw new AppError('NOT_FOUND', `Clinical record ${resultRecordId} not found`);
      }
      if (record.patientId !== order.patientId) {
        throw new AppError('INVALID_RECORD', 'Result record does not belong to the order patient');
      }
    }

    const completedAt = new Date();
    const updatedFhir = {
      ...(typeof order.fhir === 'object' && order.fhir !== null ? order.fhir : {}),
      status: 'completed',
    };

    const updated = await tx.labOrder.update({
      where: { id: order.id },
      data: {
        status: 'COMPLETED',
        completedAt,
        resultRecordId: resultRecordId ?? null,
        fhir: updatedFhir,
      },
      include: {
        doctor: { select: { id: true, fullName: true } },
        facility: { select: { id: true, name: true, code: true } },
        resultRecord: {
          select: {
            id: true,
            bundleSha256: true,
            source: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    await writeAudit(
      actor,
      {
        patientId: order.patientId,
        action: 'lab_order.complete',
        targetType: 'LabOrder',
        targetId: order.id,
        details: {
          orderCode: order.orderCode,
          resultRecordId: resultRecordId ?? null,
        },
      },
      tx,
    );

    return { order: updated };
  });
}
