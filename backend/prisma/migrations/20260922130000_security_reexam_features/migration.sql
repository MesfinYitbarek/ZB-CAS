-- Security hardening + re-exam question pool + HR retake grants

-- New enum for assessment question pools
CREATE TYPE "QuestionPool" AS ENUM ('MAIN', 'REEXAM');

-- AssessmentQuestion.pool (backfills MAIN for existing rows)
ALTER TABLE "AssessmentQuestion" ADD COLUMN "pool" "QuestionPool" NOT NULL DEFAULT 'MAIN';
CREATE INDEX "AssessmentQuestion_assessmentId_pool_idx" ON "AssessmentQuestion"("assessmentId", "pool");

-- HR retake grants ledger
CREATE TABLE "RetakeGrant" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "extraAttempts" INTEGER NOT NULL DEFAULT 1,
    "usedAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetakeGrant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RetakeGrant_assessmentId_userId_idx" ON "RetakeGrant"("assessmentId", "userId");
CREATE INDEX "RetakeGrant_userId_idx" ON "RetakeGrant"("userId");
ALTER TABLE "RetakeGrant" ADD CONSTRAINT "RetakeGrant_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetakeGrant" ADD CONSTRAINT "RetakeGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetakeGrant" ADD CONSTRAINT "RetakeGrant_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SecurityViolation: device tracking, anomaly flags, attempt archives, auto-submit marker, paste counter
ALTER TABLE "SecurityViolation" ADD COLUMN "pasteAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SecurityViolation" ADD COLUMN "autoSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SecurityViolation" ADD COLUMN "ipAddresses" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "SecurityViolation" ADD COLUMN "userAgents" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "SecurityViolation" ADD COLUMN "anomalies" JSONB;
ALTER TABLE "SecurityViolation" ADD COLUMN "attemptArchives" JSONB NOT NULL DEFAULT '[]';

-- New notification types (each statement must run outside a transaction block)
ALTER TYPE "NotificationType" ADD VALUE 'SECURITY_ALERT';
ALTER TYPE "NotificationType" ADD VALUE 'RETAKE_GRANTED';
