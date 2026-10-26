/*
  Warnings:

  - Added the required column `familyName` to the `Patient` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sex` to the `Patient` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('male', 'female', 'other', 'unknown');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "familyName" TEXT NOT NULL,
ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "givenName" TEXT,
ADD COLUMN     "sex" "Sex" NOT NULL;
