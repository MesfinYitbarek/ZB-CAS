-- P3: Asynchronous generation workflow for Tier-2 reports.
-- Excel files are no longer built inside the HTTP request; rows start PENDING,
-- transition PROCESSING -> READY (with fileName/rowCount) or FAILED (with error).
CREATE TYPE "GeneratedReportStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

ALTER TABLE "GeneratedReport"
  ADD COLUMN "status" "GeneratedReportStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "error" TEXT,
  ALTER COLUMN "fileName" SET DEFAULT '';

CREATE INDEX "GeneratedReport_status_createdAt_idx" ON "public"."GeneratedReport"("status", "createdAt");