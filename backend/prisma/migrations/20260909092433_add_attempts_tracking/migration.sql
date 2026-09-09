-- AlterTable
ALTER TABLE "public"."Assessment" ADD COLUMN     "maxAttempts" INTEGER;

-- AlterTable
ALTER TABLE "public"."SecurityViolation" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0;
