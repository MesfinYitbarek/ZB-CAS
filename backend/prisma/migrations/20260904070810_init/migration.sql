-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('Male', 'Female');

-- CreateEnum
CREATE TYPE "public"."AssessmentType" AS ENUM ('SelfAssessment', 'SupervisorOnly', 'Combined');

-- CreateEnum
CREATE TYPE "public"."AssessmentStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."TargetGroup" AS ENUM ('managerial', 'non_managerial', 'common');

-- CreateEnum
CREATE TYPE "public"."CompetencyCategory" AS ENUM ('Core_Personal_effectiveness', 'Core_Behavioral', 'Managerial', 'Leadership', 'Technical');

-- CreateEnum
CREATE TYPE "public"."QuestionType" AS ENUM ('MCQ', 'Rating', 'TrueFalse', 'MultiSelect', 'Matching', 'Ordering', 'ScenarioMCQ', 'DragDropClassification');

-- CreateEnum
CREATE TYPE "public"."RespondentType" AS ENUM ('self', 'supervisor');

-- CreateEnum
CREATE TYPE "public"."ResultStatus" AS ENUM ('PENDING', 'FINAL');

-- CreateEnum
CREATE TYPE "public"."Level" AS ENUM ('Basic', 'Intermediate', 'Advanced', 'Expert');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('PARTIAL', 'COMPLETE');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('ASSESSMENT_ASSIGNED', 'RESULT_READY', 'SUPERVISOR_REMINDER', 'DEADLINE_REMINDER', 'ACCOUNT_CREATED');

-- CreateEnum
CREATE TYPE "public"."FaqCategory" AS ENUM ('GENERAL', 'ASSESSMENT', 'ACCOUNT', 'TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ExternalRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SYNCED');

-- CreateEnum
CREATE TYPE "public"."RequiredLevel" AS ENUM ('Basic', 'Intermediate', 'Advanced', 'Expert');

-- CreateEnum
CREATE TYPE "public"."ExternalTargetGroup" AS ENUM ('MANAGERIAL', 'NON_MANAGERIAL', 'COMMON');

-- CreateEnum
CREATE TYPE "public"."AudienceType" AS ENUM ('ALL_DEPARTMENTS', 'DEPARTMENT_ALL', 'SPECIFIC_EMPLOYEES');

-- CreateEnum
CREATE TYPE "public"."EvaluationStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roles" "public"."Role"[] DEFAULT ARRAY['EMPLOYEE']::"public"."Role"[],
    "gender" "public"."Gender",
    "position" TEXT,
    "department" TEXT,
    "supervisorId" TEXT,
    "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "refreshToken" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Competency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "public"."CompetencyCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompetencyTargetGroup" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "targetGroup" "public"."TargetGroup" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CompetencyTargetGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Question" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "targetGroup" "public"."TargetGroup" NOT NULL,
    "type" "public"."QuestionType" NOT NULL,
    "text" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "correctAnswer" TEXT,
    "correctAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scenario" TEXT NOT NULL DEFAULT '',
    "matchingPairs" JSONB,
    "correctOrder" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categories" JSONB,
    "matchingLeft" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchingRight" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "orderItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "classificationItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoryNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Assessment" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "targetGroup" "public"."TargetGroup" NOT NULL,
    "purpose" TEXT NOT NULL,
    "reminderDaysBefore" INTEGER,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "audienceType" "public"."AudienceType" NOT NULL DEFAULT 'ALL_DEPARTMENTS',
    "description" TEXT NOT NULL DEFAULT '',
    "legacyDepartment" TEXT,
    "legacyPosition" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "timeLimit" INTEGER,
    "type" "public"."AssessmentType" NOT NULL,
    "selfWeight" INTEGER NOT NULL DEFAULT 20,
    "supervisorWeight" INTEGER NOT NULL DEFAULT 80,
    "status" "public"."AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssessTargetAudience" (
    "assessmentId" TEXT NOT NULL,
    "type" "public"."AudienceType" NOT NULL DEFAULT 'ALL_DEPARTMENTS',

    CONSTRAINT "AssessTargetAudience_pkey" PRIMARY KEY ("assessmentId")
);

-- CreateTable
CREATE TABLE "public"."AssessmentTargetAudienceDepartment" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "department" TEXT NOT NULL,

    CONSTRAINT "AssessmentTargetAudienceDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssessmentTargetAudienceEmployee" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "AssessmentTargetAudienceEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssessmentQuestion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupervisorEvaluation" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "status" "public"."EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SupervisorEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Response" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "selectedAnswer" JSONB,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualScore" DOUBLE PRECISION,
    "respondentType" "public"."RespondentType" NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "comments" TEXT NOT NULL DEFAULT '',
    "isSupervisorEvaluation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Result" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "level" "public"."Level" NOT NULL,
    "recommendation" TEXT NOT NULL DEFAULT '',
    "status" "public"."ResultStatus" NOT NULL DEFAULT 'FINAL',
    "scoreDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ResultQuestionDetail" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "questionId" TEXT,
    "questionNumber" INTEGER,
    "questionText" TEXT,
    "questionType" TEXT,
    "maxScore" DOUBLE PRECISION,
    "options" JSONB,
    "userAnswer" JSONB,
    "correctAnswer" JSONB,
    "scoreAwarded" DOUBLE PRECISION,
    "scorePercentage" DOUBLE PRECISION,
    "isCorrect" BOOLEAN,
    "isPartial" BOOLEAN,
    "isUnanswered" BOOLEAN,

    CONSTRAINT "ResultQuestionDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_email" TEXT NOT NULL DEFAULT '',
    "user_employeeId" TEXT NOT NULL DEFAULT '',
    "user_department" TEXT NOT NULL DEFAULT '',
    "user_position" TEXT NOT NULL DEFAULT '',
    "user_gender" TEXT NOT NULL DEFAULT '',
    "assessment_description" TEXT NOT NULL DEFAULT '',
    "assessment_type" TEXT NOT NULL DEFAULT '',
    "assessment_purpose" TEXT NOT NULL DEFAULT '',
    "assessment_targetGroup" TEXT NOT NULL DEFAULT '',
    "assessment_startDate" TIMESTAMP(3),
    "assessment_endDate" TIMESTAMP(3),
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallLevel" "public"."Level" NOT NULL DEFAULT 'Basic',
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'COMPLETE',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReportCompetency" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "competencyId" TEXT,
    "competencyName" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "finalScore" DOUBLE PRECISION NOT NULL,
    "level" "public"."Level" NOT NULL,
    "recommendation" TEXT NOT NULL DEFAULT '',
    "scoreDetails" JSONB,
    "resultId" TEXT,

    CONSTRAINT "ReportCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SecurityViolation" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "violations" JSONB,
    "totalViolations" INTEGER NOT NULL DEFAULT 0,
    "tabSwitches" INTEGER NOT NULL DEFAULT 0,
    "copyAttempts" INTEGER NOT NULL DEFAULT 0,
    "rightClickAttempts" INTEGER NOT NULL DEFAULT 0,
    "fullscreenExits" INTEGER NOT NULL DEFAULT 0,
    "devToolsAttempts" INTEGER NOT NULL DEFAULT 0,
    "windowBlurs" INTEGER NOT NULL DEFAULT 0,
    "printAttempts" INTEGER NOT NULL DEFAULT 0,
    "isHighRisk" BOOLEAN NOT NULL DEFAULT false,
    "securityLog" JSONB,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityViolation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Recommendation" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "targetGroup" "public"."TargetGroup" NOT NULL,
    "level" "public"."Level" NOT NULL,
    "recommendation" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FAQ" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" "public"."FaqCategory" NOT NULL DEFAULT 'GENERAL',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FAQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalRequest" (
    "id" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL DEFAULT 'ZB_SP',
    "sourceAssessmentId" TEXT,
    "employeeName" TEXT NOT NULL,
    "employeeEmail" TEXT NOT NULL,
    "positionTitle" TEXT NOT NULL,
    "linkedUserId" TEXT,
    "status" "public"."ExternalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalRequestCompetency" (
    "id" TEXT NOT NULL,
    "externalRequestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TECHNICAL',
    "requiredLevel" "public"."RequiredLevel" NOT NULL DEFAULT 'Intermediate',
    "targetGroup" "public"."ExternalTargetGroup" NOT NULL DEFAULT 'COMMON',

    CONSTRAINT "ExternalRequestCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalRequestLinkedAssessment" (
    "id" TEXT NOT NULL,
    "externalRequestId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,

    CONSTRAINT "ExternalRequestLinkedAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "public"."User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_supervisorId_idx" ON "public"."User"("supervisorId");

-- CreateIndex
CREATE INDEX "User_department_status_idx" ON "public"."User"("department", "status");

-- CreateIndex
CREATE INDEX "User_roles_idx" ON "public"."User"("roles");

-- CreateIndex
CREATE INDEX "Competency_category_idx" ON "public"."Competency"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Competency_name_category_key" ON "public"."Competency"("name", "category");

-- CreateIndex
CREATE INDEX "CompetencyTargetGroup_competencyId_targetGroup_idx" ON "public"."CompetencyTargetGroup"("competencyId", "targetGroup");

-- CreateIndex
CREATE INDEX "Question_competencyId_targetGroup_idx" ON "public"."Question"("competencyId", "targetGroup");

-- CreateIndex
CREATE INDEX "Question_competencyId_type_targetGroup_idx" ON "public"."Question"("competencyId", "type", "targetGroup");

-- CreateIndex
CREATE INDEX "Assessment_competencyId_idx" ON "public"."Assessment"("competencyId");

-- CreateIndex
CREATE INDEX "Assessment_status_idx" ON "public"."Assessment"("status");

-- CreateIndex
CREATE INDEX "Assessment_startDate_endDate_idx" ON "public"."Assessment"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Assessment_audienceType_idx" ON "public"."Assessment"("audienceType");

-- CreateIndex
CREATE INDEX "Assessment_targetGroup_idx" ON "public"."Assessment"("targetGroup");

-- CreateIndex
CREATE INDEX "Assessment_legacyDepartment_idx" ON "public"."Assessment"("legacyDepartment");

-- CreateIndex
CREATE INDEX "AssessmentTargetAudienceDepartment_assessmentId_idx" ON "public"."AssessmentTargetAudienceDepartment"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentTargetAudienceEmployee_assessmentId_idx" ON "public"."AssessmentTargetAudienceEmployee"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_assessmentId_idx" ON "public"."AssessmentQuestion"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_assessmentId_questionId_key" ON "public"."AssessmentQuestion"("assessmentId", "questionId");

-- CreateIndex
CREATE INDEX "SupervisorEvaluation_assessmentId_idx" ON "public"."SupervisorEvaluation"("assessmentId");

-- CreateIndex
CREATE INDEX "SupervisorEvaluation_supervisorId_status_idx" ON "public"."SupervisorEvaluation"("supervisorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupervisorEvaluation_assessmentId_employeeId_supervisorId_key" ON "public"."SupervisorEvaluation"("assessmentId", "employeeId", "supervisorId");

-- CreateIndex
CREATE INDEX "Response_assessmentId_userId_idx" ON "public"."Response"("assessmentId", "userId");

-- CreateIndex
CREATE INDEX "Response_assessmentId_employeeId_idx" ON "public"."Response"("assessmentId", "employeeId");

-- CreateIndex
CREATE INDEX "Response_userId_respondentType_idx" ON "public"."Response"("userId", "respondentType");

-- CreateIndex
CREATE INDEX "Response_assessmentId_questionId_employeeId_respondentType_idx" ON "public"."Response"("assessmentId", "questionId", "employeeId", "respondentType");

-- CreateIndex
CREATE INDEX "Response_assessmentId_employeeId_userId_respondentType_idx" ON "public"."Response"("assessmentId", "employeeId", "userId", "respondentType");

-- CreateIndex
CREATE INDEX "Result_userId_competencyId_idx" ON "public"."Result"("userId", "competencyId");

-- CreateIndex
CREATE INDEX "Result_assessmentId_idx" ON "public"."Result"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Result_userId_assessmentId_competencyId_key" ON "public"."Result"("userId", "assessmentId", "competencyId");

-- CreateIndex
CREATE INDEX "ResultQuestionDetail_resultId_idx" ON "public"."ResultQuestionDetail"("resultId");

-- CreateIndex
CREATE INDEX "Report_userId_generatedAt_idx" ON "public"."Report"("userId", "generatedAt");

-- CreateIndex
CREATE INDEX "Report_assessmentId_idx" ON "public"."Report"("assessmentId");

-- CreateIndex
CREATE INDEX "Report_user_department_generatedAt_idx" ON "public"."Report"("user_department", "generatedAt");

-- CreateIndex
CREATE INDEX "Report_overallLevel_idx" ON "public"."Report"("overallLevel");

-- CreateIndex
CREATE INDEX "Report_overallScore_idx" ON "public"."Report"("overallScore");

-- CreateIndex
CREATE UNIQUE INDEX "Report_userId_assessmentId_key" ON "public"."Report"("userId", "assessmentId");

-- CreateIndex
CREATE INDEX "ReportCompetency_reportId_idx" ON "public"."ReportCompetency"("reportId");

-- CreateIndex
CREATE INDEX "ReportCompetency_competencyId_idx" ON "public"."ReportCompetency"("competencyId");

-- CreateIndex
CREATE INDEX "Feedback_assessmentId_idx" ON "public"."Feedback"("assessmentId");

-- CreateIndex
CREATE INDEX "Feedback_userId_createdAt_idx" ON "public"."Feedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "public"."Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "public"."Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "public"."Notification"("read");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_receiverId_createdAt_idx" ON "public"."ChatMessage"("senderId", "receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_receiverId_read_idx" ON "public"."ChatMessage"("receiverId", "read");

-- CreateIndex
CREATE INDEX "SecurityViolation_assessmentId_idx" ON "public"."SecurityViolation"("assessmentId");

-- CreateIndex
CREATE INDEX "SecurityViolation_isHighRisk_idx" ON "public"."SecurityViolation"("isHighRisk");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityViolation_assessmentId_userId_key" ON "public"."SecurityViolation"("assessmentId", "userId");

-- CreateIndex
CREATE INDEX "Recommendation_targetGroup_level_idx" ON "public"."Recommendation"("targetGroup", "level");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_competencyId_targetGroup_level_key" ON "public"."Recommendation"("competencyId", "targetGroup", "level");

-- CreateIndex
CREATE INDEX "FAQ_isActive_category_order_idx" ON "public"."FAQ"("isActive", "category", "order");

-- CreateIndex
CREATE INDEX "ExternalRequest_status_idx" ON "public"."ExternalRequest"("status");

-- CreateIndex
CREATE INDEX "ExternalRequest_sourceSystem_sourceAssessmentId_idx" ON "public"."ExternalRequest"("sourceSystem", "sourceAssessmentId");

-- CreateIndex
CREATE INDEX "ExternalRequest_employeeEmail_idx" ON "public"."ExternalRequest"("employeeEmail");

-- CreateIndex
CREATE INDEX "ExternalRequestCompetency_externalRequestId_idx" ON "public"."ExternalRequestCompetency"("externalRequestId");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompetencyTargetGroup" ADD CONSTRAINT "CompetencyTargetGroup_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "public"."Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Question" ADD CONSTRAINT "Question_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "public"."Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Assessment" ADD CONSTRAINT "Assessment_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "public"."Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Assessment" ADD CONSTRAINT "Assessment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssessTargetAudience" ADD CONSTRAINT "AssessTargetAudience_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssessmentTargetAudienceDepartment" ADD CONSTRAINT "AssessmentTargetAudienceDepartment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssessmentTargetAudienceEmployee" ADD CONSTRAINT "AssessmentTargetAudienceEmployee_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssessmentTargetAudienceEmployee" ADD CONSTRAINT "AssessmentTargetAudienceEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupervisorEvaluation" ADD CONSTRAINT "SupervisorEvaluation_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupervisorEvaluation" ADD CONSTRAINT "SupervisorEvaluation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupervisorEvaluation" ADD CONSTRAINT "SupervisorEvaluation_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Response" ADD CONSTRAINT "Response_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Response" ADD CONSTRAINT "Response_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Response" ADD CONSTRAINT "Response_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Response" ADD CONSTRAINT "Response_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Result" ADD CONSTRAINT "Result_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Result" ADD CONSTRAINT "Result_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Result" ADD CONSTRAINT "Result_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "public"."Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ResultQuestionDetail" ADD CONSTRAINT "ResultQuestionDetail_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "public"."Result"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ResultQuestionDetail" ADD CONSTRAINT "ResultQuestionDetail_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportCompetency" ADD CONSTRAINT "ReportCompetency_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportCompetency" ADD CONSTRAINT "ReportCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "public"."Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportCompetency" ADD CONSTRAINT "ReportCompetency_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "public"."Result"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SecurityViolation" ADD CONSTRAINT "SecurityViolation_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SecurityViolation" ADD CONSTRAINT "SecurityViolation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recommendation" ADD CONSTRAINT "Recommendation_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "public"."Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FAQ" ADD CONSTRAINT "FAQ_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FAQ" ADD CONSTRAINT "FAQ_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalRequest" ADD CONSTRAINT "ExternalRequest_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalRequestCompetency" ADD CONSTRAINT "ExternalRequestCompetency_externalRequestId_fkey" FOREIGN KEY ("externalRequestId") REFERENCES "public"."ExternalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalRequestLinkedAssessment" ADD CONSTRAINT "ExternalRequestLinkedAssessment_externalRequestId_fkey" FOREIGN KEY ("externalRequestId") REFERENCES "public"."ExternalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalRequestLinkedAssessment" ADD CONSTRAINT "ExternalRequestLinkedAssessment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
