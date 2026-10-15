-- Auto-save hot path: Response rows must be uniquely identified by
-- (assessmentId, questionId, employeeId, respondentType) so saveAnswer can
-- use a single Prisma upsert instead of findFirst -> update/create.
--
-- 1. Deduplicate existing rows first (races could previously create twins).
--    Keeps the most recently updated row per group; NULL questionId rows
--    (supervisor evaluations) are skipped — Postgres treats NULLs as
--    distinct in unique indexes, so they cannot collide anyway.
DELETE FROM "Response" r
USING "Response" d
WHERE r."assessmentId" = d."assessmentId"
  AND r."questionId" = d."questionId"
  AND r."employeeId" = d."employeeId"
  AND r."respondentType" = d."respondentType"
  AND (r."updatedAt" < d."updatedAt"
    OR (r."updatedAt" = d."updatedAt" AND r."id" < d."id"));

-- 2. Replace the plain index with a unique one (same column order).
DROP INDEX IF EXISTS "public"."Response_assessmentId_questionId_employeeId_respondentType_idx";
CREATE UNIQUE INDEX "Response_assessmentId_questionId_employeeId_respondentType_key"
ON "public"."Response"("assessmentId", "questionId", "employeeId", "respondentType");
