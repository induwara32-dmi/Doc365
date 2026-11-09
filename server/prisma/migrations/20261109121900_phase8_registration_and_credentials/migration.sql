-- AlterTable
ALTER TABLE "Facility" ADD COLUMN "licenseNumber" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "slmcNumber" TEXT,
ADD COLUMN "specialization" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_slmcNumber_key" ON "User"("slmcNumber");
