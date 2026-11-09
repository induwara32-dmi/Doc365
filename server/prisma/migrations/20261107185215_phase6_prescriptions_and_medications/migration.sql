-- CreateEnum
CREATE TYPE "PrescriptionState" AS ENUM ('PENDING', 'PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');

-- CreateTable
CREATE TABLE "Prescription" (
    "id" UUID NOT NULL,
    "prescriptionCode" TEXT NOT NULL,
    "patientId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "medicationCode" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dosageInstruction" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "daysSupply" INTEGER NOT NULL,
    "repeatsAllowed" INTEGER NOT NULL DEFAULT 0,
    "repeatsRemaining" INTEGER NOT NULL DEFAULT 0,
    "quantityDispensedTotal" INTEGER NOT NULL DEFAULT 0,
    "dispenseState" "PrescriptionState" NOT NULL DEFAULT 'PENDING',
    "fhir" JSONB NOT NULL,
    "provenance" JSONB,
    "bundleSha256" TEXT,
    "signingKeyFingerprint" TEXT,
    "overrideReason" TEXT,
    "authoredOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationDispense" (
    "id" UUID NOT NULL,
    "prescriptionId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "pharmacyFacilityId" UUID NOT NULL,
    "pharmacistUserId" UUID NOT NULL,
    "quantityDispensed" INTEGER NOT NULL,
    "daysSupply" INTEGER NOT NULL,
    "notes" TEXT,
    "fhir" JSONB NOT NULL,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationDispense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAllergy" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "substance" TEXT NOT NULL,
    "severity" "AllergySeverity" NOT NULL DEFAULT 'MODERATE',
    "reaction" TEXT,
    "recordedByUserId" UUID,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PatientAllergy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_prescriptionCode_key" ON "Prescription"("prescriptionCode");

-- CreateIndex
CREATE INDEX "Prescription_patientId_dispenseState_idx" ON "Prescription"("patientId", "dispenseState");

-- CreateIndex
CREATE INDEX "Prescription_facilityId_idx" ON "Prescription"("facilityId");

-- CreateIndex
CREATE INDEX "Prescription_doctorId_idx" ON "Prescription"("doctorId");

-- CreateIndex
CREATE INDEX "MedicationDispense_prescriptionId_idx" ON "MedicationDispense"("prescriptionId");

-- CreateIndex
CREATE INDEX "MedicationDispense_patientId_dispensedAt_idx" ON "MedicationDispense"("patientId", "dispensedAt");

-- CreateIndex
CREATE INDEX "MedicationDispense_pharmacyFacilityId_idx" ON "MedicationDispense"("pharmacyFacilityId");

-- CreateIndex
CREATE INDEX "PatientAllergy_patientId_active_idx" ON "PatientAllergy"("patientId", "active");

-- CreateIndex
CREATE INDEX "PatientAllergy_substance_idx" ON "PatientAllergy"("substance");

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MedicationDispense" ADD CONSTRAINT "MedicationDispense_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MedicationDispense" ADD CONSTRAINT "MedicationDispense_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MedicationDispense" ADD CONSTRAINT "MedicationDispense_pharmacyFacilityId_fkey" FOREIGN KEY ("pharmacyFacilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MedicationDispense" ADD CONSTRAINT "MedicationDispense_pharmacistUserId_fkey" FOREIGN KEY ("pharmacistUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------- Hand-written (Prisma cannot express these in schema.prisma) ----------

-- Enforce positive quantities and valid repeat counts on Prescriptions
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_quantity_positive" CHECK (
  "quantity" > 0 AND "daysSupply" > 0 AND "repeatsAllowed" >= 0 AND "repeatsRemaining" >= 0 AND "quantityDispensedTotal" >= 0
);

-- Enforce positive quantity dispensed and positive days supply on Dispenses
ALTER TABLE "MedicationDispense" ADD CONSTRAINT "MedicationDispense_quantity_positive" CHECK (
  "quantityDispensed" > 0 AND "daysSupply" > 0
);

