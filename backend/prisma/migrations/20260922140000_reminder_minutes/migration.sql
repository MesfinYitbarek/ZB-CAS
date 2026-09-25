-- Reminder lead time: days (reminderDaysBefore) -> minutes (reminderMinutesBefore).
-- Existing day values are preserved as minutes (x1440) so scheduled reminders keep firing.
ALTER TABLE "Assessment" ADD COLUMN "reminderMinutesBefore" INTEGER;
UPDATE "Assessment" SET "reminderMinutesBefore" = "reminderDaysBefore" * 1440 WHERE "reminderDaysBefore" IS NOT NULL;
ALTER TABLE "Assessment" DROP COLUMN "reminderDaysBefore";
