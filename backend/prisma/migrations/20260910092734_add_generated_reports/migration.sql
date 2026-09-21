-- CreateEnum
CREATE TYPE "public"."GeneratedReportType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION', 'CUSTOM_PIVOT');

-- CreateTable
CREATE TABLE "public"."GeneratedReport" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "public"."GeneratedReportType" NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "pivot" JSONB,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "generatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedReport_generatedBy_createdAt_idx" ON "public"."GeneratedReport"("generatedBy", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedReport_type_idx" ON "public"."GeneratedReport"("type");

-- AddForeignKey
ALTER TABLE "public"."GeneratedReport" ADD CONSTRAINT "GeneratedReport_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
