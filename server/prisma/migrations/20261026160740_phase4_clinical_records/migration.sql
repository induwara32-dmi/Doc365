-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('FACILITY_SIGNED', 'PATIENT_UPLOADED');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('final', 'amended', 'entered-in-error');

-- CreateTable
CREATE TABLE "ClinicalRecord" (
    "id" UUID NOT NULL,
    "lineageId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "previousVersionId" UUID,
    "patientId" UUID NOT NULL,
    "source" "RecordSource" NOT NULL,
    "status" "RecordStatus" NOT NULL,
    "mainResource" TEXT NOT NULL,
    "facilityId" UUID,
    "uploadedByUserId" UUID NOT NULL,
    "uploadedByMembershipId" UUID,
    "bundle" JSONB NOT NULL,
    "provenance" JSONB,
    "bundleSha256" TEXT NOT NULL,
    "signingKeyFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalRecord_previousVersionId_key" ON "ClinicalRecord"("previousVersionId");

-- CreateIndex
CREATE INDEX "ClinicalRecord_patientId_createdAt_idx" ON "ClinicalRecord"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalRecord_lineageId_version_key" ON "ClinicalRecord"("lineageId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalRecord_facilityId_bundleSha256_key" ON "ClinicalRecord"("facilityId", "bundleSha256");

-- AddForeignKey
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "ClinicalRecord"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_uploadedByMembershipId_fkey" FOREIGN KEY ("uploadedByMembershipId") REFERENCES "StaffMembership"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------- Hand-written (Prisma cannot express these in schema.prisma) ----------

-- A facility-signed record has a signer, the uploader's membership, a Provenance and
-- the fingerprint of the public key that verified it.
-- A patient upload has none of them.
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_source_matches" CHECK (
  ("source" = 'FACILITY_SIGNED'
     AND "facilityId" IS NOT NULL AND "uploadedByMembershipId" IS NOT NULL AND "provenance" IS NOT NULL
     AND "signingKeyFingerprint" IS NOT NULL)
  OR
  ("source" = 'PATIENT_UPLOADED'
     AND "facilityId" IS NULL AND "uploadedByMembershipId" IS NULL AND "provenance" IS NULL
     AND "signingKeyFingerprint" IS NULL)
);

-- Version 1 starts its own lineage; every later version points to the one it corrects.
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_version_chain" CHECK (
  ("version" = 1 AND "previousVersionId" IS NULL AND "lineageId" = "id")
  OR
  ("version" > 1 AND "previousVersionId" IS NOT NULL)
);

-- Clinical records are append-only: a correction is a NEW row, never an edit.
-- A reusable function that names the table in its error message.
CREATE FUNCTION "refuse_change_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClinicalRecord_append_only"
BEFORE UPDATE OR DELETE ON "ClinicalRecord"
FOR EACH ROW EXECUTE FUNCTION "refuse_change_append_only"();

CREATE TRIGGER "ClinicalRecord_no_truncate"
BEFORE TRUNCATE ON "ClinicalRecord"
FOR EACH STATEMENT EXECUTE FUNCTION "refuse_change_append_only"();
