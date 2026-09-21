-- P1: Indexes on hot filter columns.
-- Live analytics queries filter Result by (status, assessmentId), (status, userId)
-- and (status, createdAt), and Assessment by (status, endDate). User filter
-- dimensions (position, gender) and the audience/question junction lookups
-- (employeeId, questionId) also get coverage.
CREATE INDEX "Result_status_assessmentId_idx" ON "Result"("status", "assessmentId");
CREATE INDEX "Result_status_userId_createdAt_idx" ON "Result"("status", "userId", "createdAt");
CREATE INDEX "Result_status_createdAt_idx" ON "Result"("status", "createdAt");
CREATE INDEX "Result_status_level_idx" ON "Result"("status", "level");
CREATE INDEX "Assessment_status_endDate_idx" ON "Assessment"("status", "endDate");
CREATE INDEX "User_position_idx" ON "User"("position");
CREATE INDEX "User_gender_idx" ON "User"("gender");
CREATE INDEX "AssessmentTargetAudienceEmployee_employeeId_idx" ON "AssessmentTargetAudienceEmployee"("employeeId");
CREATE INDEX "AssessmentQuestion_questionId_idx" ON "AssessmentQuestion"("questionId");