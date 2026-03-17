/* services/schedulerService.js
 *
 * Runs time-based assessment lifecycle jobs using node-cron.
 * Imported once in app.js after the DB connection is established.
 *
 * Jobs
 * ────
 *  1. Assessment lifecycle   (every 5 min)
 *     • SCHEDULED → ACTIVE  when startDate has passed
 *     • ACTIVE    → COMPLETED when endDate has passed
 *
 *  2. Reminder emails        (daily at 07:00 server time)
 *     • Sends reminder emails to employees whose assessment deadline
 *       is within assessment.reminderDaysBefore days.
 *
 * All jobs are wrapped in try/catch so a single failure never crashes
 * the process.  Results are logged via the structured logger.
 */
import cron from 'node-cron';
import logger from '../utils/logger.js';
import {
  autoActivateScheduledAssessments,
  autoCompleteExpiredAssessments,
  processPendingReminders,
} from '../controllers/assessmentController.js';

// ─── Job 1: Assessment lifecycle — every 5 minutes ───────────────────────────
const startLifecycleJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const activated = await autoActivateScheduledAssessments();
      const completed = await autoCompleteExpiredAssessments();

      if (activated > 0 || completed > 0) {
        logger.info({
          event: 'scheduler_lifecycle',
          activated,
          completed,
        });
      }
    } catch (err) {
      logger.error({ event: 'scheduler_lifecycle_error', err: err.message });
    }
  });

  logger.info({ event: 'scheduler_started', job: 'lifecycle', schedule: '*/5 * * * *' });
};

// ─── Job 2: Reminder emails — daily at 07:00 ────────────────────────────────
const startReminderJob = () => {
  cron.schedule('0 7 * * *', async () => {
    try {
      const processed = await processPendingReminders();
      logger.info({ event: 'scheduler_reminders', processed });
    } catch (err) {
      logger.error({ event: 'scheduler_reminder_error', err: err.message });
    }
  });

  logger.info({ event: 'scheduler_started', job: 'reminders', schedule: '0 7 * * *' });
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
export const startScheduler = () => {
  startLifecycleJob();
  startReminderJob();
};