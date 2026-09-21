-- Recreate the AssessmentStatus enum without ARCHIVED.
-- All rows previously using ARCHIVED were converted to COMPLETED beforehand.
ALTER TABLE "Assessment" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "AssessmentStatus_new" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED');
ALTER TABLE "Assessment" ALTER COLUMN "status" TYPE "AssessmentStatus_new" USING ("status"::text::"AssessmentStatus_new");
DROP TYPE "AssessmentStatus";
ALTER TYPE "AssessmentStatus_new" RENAME TO "AssessmentStatus";
ALTER TABLE "Assessment" ALTER COLUMN "status" SET DEFAULT 'DRAFT';