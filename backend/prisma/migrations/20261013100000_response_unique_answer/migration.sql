-- Remove duplicate answer rows (keep the most recently updated one) before
-- adding the unique index that makes auto-save an atomic upsert.
DELETE FROM "Response" a
USING "Response" b
WHERE a."questionId" IS NOT NULL
  AND a."assessmentId" = b."assessmentId"
  AND a."questionId" = b."questionId"
  AND a."userId" = b."userId"
  AND a."employeeId" = b."employeeId"
  AND a."respondentType" = b."respondentType"
  AND (a."updatedAt" < b."updatedAt" OR (a."updatedAt" = b."updatedAt" AND a."id" < b."id"));

CREATE UNIQUE INDEX "Response_unique_answer"
  ON "Response"("assessmentId", "questionId", "userId", "employeeId", "respondentType");
