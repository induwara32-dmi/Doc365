// Onboarding & Registration service for Doc365 Multi-Tenant Platform.
// Handles self-registration for Citizens/Patients, Doctors (SLMC verified),
// Pharmacies (NMRA licensed), and Diagnostic Laboratories (PHSRC accredited).

import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { AppError } from '../errors.js';
import { writeAudit } from '../audit/audit-log.js';
import { hashPassword } from './passwords.js';
import { normalizeUsername } from './account-service.js';
import { signSessionToken } from './tokens.js';
import { actorForMembership, actorForPatient, publicSession } from './session.js';
import { generateHealthId } from '../patients/health-id.js';
import { generateCardSerial, cardQrPayload } from '../patients/card-service.js';
import { buildFhirPatient } from '../patients/fhir-patient.js';
import { parseDate } from '../patients/age.js';

function generateEd25519PublicKey() {
  const kp = crypto.generateKeyPairSync('ed25519');
  return kp.publicKey.export({ type: 'spki', format: 'pem' });
}

/**
 * Register a new Patient + User account + Digital Health Card
 */
export async function registerPatient({
  username,
  password,
  givenName,
  familyName,
  fullName,
  dateOfBirth,
  sex,
  nic,
}) {
  const normUser = normalizeUsername(username);

  // 1. Check username availability
  const existingUser = await prisma.user.findUnique({ where: { username: normUser } });
  if (existingUser) {
    throw new AppError('USERNAME_TAKEN', 'This username is already taken');
  }

  // 2. Validate NIC if provided
  if (nic) {
    const existingNic = await prisma.patient.findUnique({ where: { nic } });
    if (existingNic) {
      throw new AppError('NIC_ALREADY_LINKED', 'This NIC is already linked to another patient');
    }
  }

  const dob = typeof dateOfBirth === 'string' ? parseDate(dateOfBirth) : dateOfBirth;
  const passwordHash = await hashPassword(password);
  const healthId = generateHealthId();
  const cardSerial = generateCardSerial();

  const patientId = crypto.randomUUID();
  const cardId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  const effectiveFullName = fullName?.trim() || `${givenName?.trim() ?? ''} ${familyName.trim()}`.trim();

  const fhir = buildFhirPatient({
    healthId,
    nic: nic ?? null,
    givenName: givenName?.trim() ?? null,
    familyName: familyName.trim(),
    fullName: effectiveFullName,
    sex,
    dateOfBirth: dob,
  });

  const result = await prisma.$transaction(async (tx) => {
    // A. Create Patient
    const patient = await tx.patient.create({
      data: {
        id: patientId,
        healthId,
        nic: nic ?? null,
        givenName: givenName?.trim() ?? null,
        familyName: familyName.trim(),
        fullName: effectiveFullName,
        sex,
        dateOfBirth: dob,
        fhir,
      },
    });

    // B. Create Active Health Card
    const card = await tx.card.create({
      data: {
        id: cardId,
        patientId: patient.id,
        serial: cardSerial,
        status: 'ACTIVE',
      },
    });

    // C. Create User Account
    const user = await tx.user.create({
      data: {
        id: userId,
        username: normUser,
        passwordHash,
        fullName: effectiveFullName,
        patientId: patient.id,
      },
    });

    // D. Write Audit Trail
    const actor = actorForPatient(user);
    await writeAudit(
      actor,
      {
        action: 'auth.register_patient',
        patientId: patient.id,
        targetType: 'Patient',
        targetId: patient.id,
        details: { healthId, cardSerial },
      },
      tx,
    );

    return { patient, card, user, actor };
  });

  const token = signSessionToken({ userId: result.user.id, membershipId: null });
  return {
    token,
    expiresInSeconds: 15 * 60,
    session: publicSession(result.actor),
    patient: result.patient,
    card: { serial: result.card.serial, status: result.card.status },
    qrPayload: cardQrPayload(result.patient.healthId, result.card.serial),
  };
}

/**
 * Register a new Doctor with SLMC credentials and facility membership
 */
export async function registerDoctor({
  username,
  password,
  fullName,
  slmcNumber,
  specialization,
  facilityId,
  jobTitle = 'Consultant Physician',
}) {
  const normUser = normalizeUsername(username);

  // 1. Check username
  const existingUser = await prisma.user.findUnique({ where: { username: normUser } });
  if (existingUser) {
    throw new AppError('USERNAME_TAKEN', 'This username is already taken');
  }

  // 2. Check SLMC uniqueness
  const cleanSlmc = slmcNumber.trim().toUpperCase();
  const existingSlmc = await prisma.user.findUnique({ where: { slmcNumber: cleanSlmc } });
  if (existingSlmc) {
    throw new AppError('SLMC_ALREADY_REGISTERED', `SLMC registration number ${cleanSlmc} is already registered`);
  }

  // 3. Verify facility
  const facility = await prisma.facility.findUnique({ where: { id: facilityId } });
  if (!facility) {
    throw new AppError('FACILITY_NOT_FOUND', 'Selected hospital or clinic facility was not found');
  }
  if (!['HOSPITAL', 'CLINIC'].includes(facility.type)) {
    throw new AppError('INVALID_FACILITY_TYPE', 'Doctors can only register at Hospitals or Clinics');
  }

  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();

  const result = await prisma.$transaction(async (tx) => {
    // A. Create User
    const user = await tx.user.create({
      data: {
        id: userId,
        username: normUser,
        passwordHash,
        fullName: fullName.trim(),
        slmcNumber: cleanSlmc,
        specialization: specialization?.trim() || 'General Medicine',
      },
    });

    // B. Create Doctor Staff Membership
    const membership = await tx.staffMembership.create({
      data: {
        id: membershipId,
        userId: user.id,
        facilityId: facility.id,
        role: 'DOCTOR',
        jobTitle: jobTitle?.trim() || 'Consultant Physician',
        status: 'ACTIVE',
      },
      include: { facility: true },
    });

    // C. Write Audit Trail
    const actor = actorForMembership(user, membership);
    await writeAudit(
      actor,
      {
        action: 'auth.register_doctor',
        targetType: 'User',
        targetId: user.id,
        details: { slmcNumber: cleanSlmc, facilityId: facility.id },
      },
      tx,
    );

    return { user, membership, actor };
  });

  const token = signSessionToken({ userId: result.user.id, membershipId: result.membership.id });
  return {
    token,
    expiresInSeconds: 15 * 60,
    session: publicSession(result.actor),
    user: {
      id: result.user.id,
      username: result.user.username,
      fullName: result.user.fullName,
      slmcNumber: result.user.slmcNumber,
      specialization: result.user.specialization,
    },
    membership: {
      id: result.membership.id,
      role: result.membership.role,
      jobTitle: result.membership.jobTitle,
      facilityName: facility.name,
      facilityCode: facility.code,
    },
  };
}

/**
 * Register a new Pharmacy Facility and its supervising Pharmacist
 */
export async function registerPharmacy({
  pharmacyName,
  pharmacyCode,
  nmraLicense,
  username,
  password,
  fullName,
  jobTitle = 'Supervising Pharmacist',
  publicKeyPem = null,
}) {
  const normUser = normalizeUsername(username);
  const cleanCode = pharmacyCode.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Check uniqueness
  const [existingUser, existingFac] = await Promise.all([
    prisma.user.findUnique({ where: { username: normUser } }),
    prisma.facility.findUnique({ where: { code: cleanCode } }),
  ]);

  if (existingUser) throw new AppError('USERNAME_TAKEN', 'This username is already taken');
  if (existingFac) throw new AppError('FACILITY_EXISTS', `Facility code "${cleanCode}" is already registered`);

  const passwordHash = await hashPassword(password);
  const pubPem = publicKeyPem || generateEd25519PublicKey();

  const facilityId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();

  const result = await prisma.$transaction(async (tx) => {
    const facility = await tx.facility.create({
      data: {
        id: facilityId,
        code: cleanCode,
        name: pharmacyName.trim(),
        type: 'PHARMACY',
        licenseNumber: nmraLicense.trim().toUpperCase(),
        publicKeyPem: pubPem,
      },
    });

    const user = await tx.user.create({
      data: {
        id: userId,
        username: normUser,
        passwordHash,
        fullName: fullName.trim(),
      },
    });

    const membership = await tx.staffMembership.create({
      data: {
        id: membershipId,
        userId: user.id,
        facilityId: facility.id,
        role: 'PHARMACIST',
        jobTitle: jobTitle.trim(),
        status: 'ACTIVE',
      },
      include: { facility: true },
    });

    const actor = actorForMembership(user, membership);
    await writeAudit(
      actor,
      {
        action: 'auth.register_pharmacy',
        targetType: 'Facility',
        targetId: facility.id,
        details: { nmraLicense: facility.licenseNumber },
      },
      tx,
    );

    return { facility, user, membership, actor };
  });

  const token = signSessionToken({ userId: result.user.id, membershipId: result.membership.id });
  return {
    token,
    expiresInSeconds: 15 * 60,
    session: publicSession(result.actor),
    facility: result.facility,
    user: { id: result.user.id, username: result.user.username, fullName: result.user.fullName },
  };
}

/**
 * Register a new Diagnostic Laboratory and its lead MLT
 */
export async function registerLab({
  labName,
  labCode,
  phsrcRegNo,
  username,
  password,
  fullName,
  jobTitle = 'Medical Laboratory Technologist',
  publicKeyPem = null,
}) {
  const normUser = normalizeUsername(username);
  const cleanCode = labCode.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Check uniqueness
  const [existingUser, existingFac] = await Promise.all([
    prisma.user.findUnique({ where: { username: normUser } }),
    prisma.facility.findUnique({ where: { code: cleanCode } }),
  ]);

  if (existingUser) throw new AppError('USERNAME_TAKEN', 'This username is already taken');
  if (existingFac) throw new AppError('FACILITY_EXISTS', `Facility code "${cleanCode}" is already registered`);

  const passwordHash = await hashPassword(password);
  const pubPem = publicKeyPem || generateEd25519PublicKey();

  const facilityId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();

  const result = await prisma.$transaction(async (tx) => {
    const facility = await tx.facility.create({
      data: {
        id: facilityId,
        code: cleanCode,
        name: labName.trim(),
        type: 'LAB',
        licenseNumber: phsrcRegNo.trim().toUpperCase(),
        publicKeyPem: pubPem,
      },
    });

    const user = await tx.user.create({
      data: {
        id: userId,
        username: normUser,
        passwordHash,
        fullName: fullName.trim(),
      },
    });

    const membership = await tx.staffMembership.create({
      data: {
        id: membershipId,
        userId: user.id,
        facilityId: facility.id,
        role: 'LAB_STAFF',
        jobTitle: jobTitle.trim(),
        status: 'ACTIVE',
      },
      include: { facility: true },
    });

    const actor = actorForMembership(user, membership);
    await writeAudit(
      actor,
      {
        action: 'auth.register_lab',
        targetType: 'Facility',
        targetId: facility.id,
        details: { phsrcRegNo: facility.licenseNumber },
      },
      tx,
    );

    return { facility, user, membership, actor };
  });

  const token = signSessionToken({ userId: result.user.id, membershipId: result.membership.id });
  return {
    token,
    expiresInSeconds: 15 * 60,
    session: publicSession(result.actor),
    facility: result.facility,
    user: { id: result.user.id, username: result.user.username, fullName: result.user.fullName },
  };
}

/**
 * List registered healthcare facilities for doctor signup & selection
 */
export async function listPublicFacilities({ type } = {}) {
  const facilities = await prisma.facility.findMany({
    where: {
      ...(type ? { type } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      licenseNumber: true,
    },
    orderBy: { name: 'asc' },
  });

  return { facilities };
}
