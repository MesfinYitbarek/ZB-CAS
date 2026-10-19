-- Keep Result rows when their Assessment is deleted (assessmentId becomes NULL).
ALTER TABLE "Result" DROP CONSTRAINT "Result_assessmentId_fkey";
ALTER TABLE "Result" ALTER COLUMN "assessmentId" DROP NOT NULL;
ALTER TABLE "Result" ADD CONSTRAINT "Result_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
