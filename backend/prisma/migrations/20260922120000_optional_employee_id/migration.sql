-- AlterTable: make User.employeeId optional
ALTER TABLE "User" ALTER COLUMN "employeeId" DROP NOT NULL;
