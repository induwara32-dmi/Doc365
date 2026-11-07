-- AlterTable
ALTER TABLE "ClinicalRecord" ADD COLUMN     "isSensitive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "optOutReason" TEXT,
ADD COLUMN     "optedOutAt" TIMESTAMP(3),
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "researchOptOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "cardId" UUID,
    "grantedByUserId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" UUID,
    "isBreakGlass" BOOLEAN NOT NULL DEFAULT false,
    "breakGlassReason" TEXT,

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProviderBlock" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "facilityId" UUID,
    "doctorUserId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PatientProviderBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiddenRecord" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "lineageId" UUID NOT NULL,
    "hiddenByUserId" UUID NOT NULL,
    "reason" TEXT,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HiddenRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessGrant_patientId_facilityId_idx" ON "AccessGrant"("patientId", "facilityId");

-- CreateIndex
CREATE INDEX "AccessGrant_patientId_expiresAt_idx" ON "AccessGrant"("patientId", "expiresAt");

-- CreateIndex
CREATE INDEX "PatientProviderBlock_patientId_active_idx" ON "PatientProviderBlock"("patientId", "active");

-- CreateIndex
CREATE INDEX "PatientProviderBlock_facilityId_idx" ON "PatientProviderBlock"("facilityId");

-- CreateIndex
CREATE INDEX "PatientProviderBlock_doctorUserId_idx" ON "PatientProviderBlock"("doctorUserId");

-- CreateIndex
CREATE INDEX "HiddenRecord_patientId_active_idx" ON "HiddenRecord"("patientId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenRecord_patientId_lineageId_key" ON "HiddenRecord"("patientId", "lineageId");

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PatientProviderBlock" ADD CONSTRAINT "PatientProviderBlock_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PatientProviderBlock" ADD CONSTRAINT "PatientProviderBlock_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PatientProviderBlock" ADD CONSTRAINT "PatientProviderBlock_doctorUserId_fkey" FOREIGN KEY ("doctorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HiddenRecord" ADD CONSTRAINT "HiddenRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HiddenRecord" ADD CONSTRAINT "HiddenRecord_hiddenByUserId_fkey" FOREIGN KEY ("hiddenByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------- Hand-written (Prisma cannot express these in schema.prisma) ----------

-- Standard grants require a physical card scan; break-glass emergency grants require a justification string.
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_break_glass_check" CHECK (
  ("isBreakGlass" = true AND "breakGlassReason" IS NOT NULL)
  OR
  ("isBreakGlass" = false AND "cardId" IS NOT NULL)
);

-- A provider block must target a facility, a doctor, or both.
ALTER TABLE "PatientProviderBlock" ADD CONSTRAINT "PatientProviderBlock_target_check" CHECK (
  "facilityId" IS NOT NULL OR "doctorUserId" IS NOT NULL
);

