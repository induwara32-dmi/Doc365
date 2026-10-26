-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'REPLACED');

-- CreateEnum
CREATE TYPE "GuardianRelationship" AS ENUM ('MOTHER', 'FATHER', 'LEGAL_GUARDIAN');

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "healthId" TEXT NOT NULL,
    "nic" TEXT,
    "dateOfBirth" DATE NOT NULL,
    "fhir" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" UUID NOT NULL,
    "serial" TEXT NOT NULL,
    "patientId" UUID NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianLink" (
    "id" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "relationship" "GuardianRelationship" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Patient_healthId_key" ON "Patient"("healthId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_nic_key" ON "Patient"("nic");

-- CreateIndex
CREATE UNIQUE INDEX "Card_serial_key" ON "Card"("serial");

-- CreateIndex
CREATE INDEX "Card_patientId_idx" ON "Card"("patientId");

-- CreateIndex
CREATE INDEX "GuardianLink_guardianId_idx" ON "GuardianLink"("guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianLink_childId_guardianId_key" ON "GuardianLink"("childId", "guardianId");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianLink" ADD CONSTRAINT "GuardianLink_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianLink" ADD CONSTRAINT "GuardianLink_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- Hand-written (Prisma cannot express these in schema.prisma) ----------

-- At most one ACTIVE card per patient. A "partial" index only covers rows
-- WHERE status = 'ACTIVE', so a patient can still have many BLOCKED/REPLACED cards.
CREATE UNIQUE INDEX "Card_one_active_per_patient"
ON "Card"("patientId") WHERE "status" = 'ACTIVE';

-- A patient cannot be their own guardian.
ALTER TABLE "GuardianLink" ADD CONSTRAINT "GuardianLink_not_own_guardian"
CHECK ("childId" <> "guardianId");
