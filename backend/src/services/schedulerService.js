/* services/schedulerService.js
 *
 * Real-time assessment lifecycle using setTimeout (Option A).
 *
 * How it works
 * ────────────
 *  On startup, scheduleAllPendingAssessments() loads every SCHEDULED and
 *  ACTIVE assessment from the DB and arms a precise setTimeout for each one:
 *    • SCHEDULED  →  fires at startDate  →  sets status ACTIVE
 *    • ACTIVE     →  fires at endDate    →  sets status COMPLETED
 *
 *  When HR creates / promotes a new assessment to SCHEDULED, the controller
 *  calls scheduleAssessmentTimers(assessment) to arm timers immediately —
 *  no need to wait for any cron tick.
 *
 *  Safety-net cron (every 1 min)
 *  ─────────────────────────────
 *  Timers live in Node.js memory.  A server restart wipes them.
 *  The 1-minute cron re-arms any assessment whose timer was lost and
 *  immediately flips anything that is already overdue.  Under normal
 *  operation (no restarts) the cron finds nothing to do.
 *
 *  Timer map
 *  ─────────
 *  activeTimers  Map<assessmentId-string, { start?: Timeout, end?: Timeout }>
 *  Storing handles lets us cancel timers if an assessment is deleted or its
 *  dates change before the timer fires (call clearAssessmentTimers(id)).
 *
 *  Node.js setTimeout limit
 *  ────────────────────────
 *  setTimeout delay is stored as a 32-bit signed integer (max ~24.8 days).
 *  For assessments scheduled further out we re-arm via a chain of 20-day
 *  intermediate timeouts so no event is ever lost.
 */

import cron from 'node-cron';
import Assessment from '../models/Assessment.js';
import logger from '../utils/logger.js';
import {
  autoActivateScheduledAssessments,
  autoCompleteExpiredAssessments,
  processPendingReminders,
} from '../controllers/assessmentController.js';

// ─── Timer registry ───────────────────────────────────────────────────────────
const activeTimers = new Map();

const MAX_TIMEOUT_MS = 20 * 24 * 60 * 60 * 1000; // 20 days (safe under 24.8-day limit)

/**
 * Wrapper around setTimeout that chains for delays > MAX_TIMEOUT_MS.
 * Returns the Timeout handle (or the first intermediate handle).
 */
function safeTimeout(fn, delayMs) {
  if (delayMs <= MAX_TIMEOUT_MS) {
    return setTimeout(fn, delayMs);
  }
  return setTimeout(() => safeTimeout(fn, delayMs - MAX_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

// ─── Clear existing timers for an assessment ─────────────────────────────────
export const clearAssessmentTimers = (assessmentId) => {
  const id = assessmentId.toString();
  const entry = activeTimers.get(id);
  if (entry) {
    if (entry.start) clearTimeout(entry.start);
    if (entry.end)   clearTimeout(entry.end);
    activeTimers.delete(id);
  }
};

// ─── Arm timers for a single assessment object ───────────────────────────────
export const scheduleAssessmentTimers = (assessment) => {
  const id    = assessment._id.toString();
  clearAssessmentTimers(id);

  const now     = Date.now();
  const startMs = new Date(assessment.startDate).getTime() - now;
  const endMs   = new Date(assessment.endDate).getTime()   - now;
  const entry   = {};

  // SCHEDULED → ACTIVE
  if (assessment.status === 'SCHEDULED' && startMs > 0) {
    entry.start = safeTimeout(async () => {
      try {
        await Assessment.findOneAndUpdate(
          { _id: assessment._id, status: 'SCHEDULED' },
          { $set: { status: 'ACTIVE' } }
        );
        logger.info({ event: 'timer_activated', assessmentId: id });
      } catch (err) {
        logger.error({ event: 'timer_activate_error', assessmentId: id, err: err.message });
      }

      // Arm end timer now that assessment is active
      const remainingMs = new Date(assessment.endDate).getTime() - Date.now();
      if (remainingMs > 0) {
        const endEntry = activeTimers.get(id) || {};
        endEntry.end = safeTimeout(async () => {
          try {
            await Assessment.findOneAndUpdate(
              { _id: assessment._id, status: 'ACTIVE' },
              { $set: { status: 'COMPLETED' } }
            );
            logger.info({ event: 'timer_completed', assessmentId: id });
          } catch (err) {
            logger.error({ event: 'timer_complete_error', assessmentId: id, err: err.message });
          }
          activeTimers.delete(id);
        }, remainingMs);
        activeTimers.set(id, endEntry);
      }
    }, startMs);
  }

  // ACTIVE → COMPLETED (assessment already running, only arm end timer)
  if (assessment.status === 'ACTIVE' && endMs > 0) {
    entry.end = safeTimeout(async () => {
      try {
        await Assessment.findOneAndUpdate(
          { _id: assessment._id, status: 'ACTIVE' },
          { $set: { status: 'COMPLETED' } }
        );
        logger.info({ event: 'timer_completed', assessmentId: id });
      } catch (err) {
        logger.error({ event: 'timer_complete_error', assessmentId: id, err: err.message });
      }
      activeTimers.delete(id);
    }, endMs);
  }

  if (Object.keys(entry).some(k => entry[k])) {
    activeTimers.set(id, entry);
    logger.info({
      event:        'timer_armed',
      assessmentId: id,
      status:       assessment.status,
      startsIn:     startMs > 0 ? `${Math.round(startMs / 1000)}s` : 'already started',
      endsIn:       endMs   > 0 ? `${Math.round(endMs   / 1000)}s` : 'already ended',
    });
  }
};

// ─── On startup: arm timers for all pending assessments in the DB ─────────────
const scheduleAllPendingAssessments = async () => {
  const pending = await Assessment.find({ status: { $in: ['SCHEDULED', 'ACTIVE'] } }).lean();
  for (const a of pending) scheduleAssessmentTimers(a);
  if (pending.length > 0) {
    logger.info({ event: 'timers_armed_on_startup', count: pending.length });
  }
};

// ─── Safety-net cron: every 1 minute ─────────────────────────────────────────
// Catches anything overdue after a server restart (timers lost from memory).
// Under normal operation this does nothing.
const startSafetyNetCron = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const activated = await autoActivateScheduledAssessments();
      const completed = await autoCompleteExpiredAssessments();

      // Re-arm end timers for anything just activated by the safety net
      if (activated > 0) {
        const nowActive = await Assessment.find({ status: 'ACTIVE' }).lean();
        for (const a of nowActive) {
          if (!activeTimers.has(a._id.toString())) {
            scheduleAssessmentTimers(a);
          }
        }
      }

      if (activated > 0 || completed > 0) {
        logger.info({
          event:     'safety_net_cron_fired',
          activated,
          completed,
          note:      'Timers were missing — likely a restart occurred',
        });
      }
    } catch (err) {
      logger.error({ event: 'safety_net_cron_error', err: err.message });
    }
  });

  logger.info({ event: 'scheduler_started', job: 'safety_net_cron', schedule: '* * * * *' });
};

// ─── Reminder emails — daily at 07:00 ────────────────────────────────────────
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
export const startScheduler = async () => {
  // 1. Immediately flip anything already overdue (handles cold-start / long downtime)
  await autoActivateScheduledAssessments();
  await autoCompleteExpiredAssessments();

  // 2. Arm precise setTimeout timers for everything still pending
  await scheduleAllPendingAssessments();

  // 3. Safety-net cron — recovers lost timers after a restart
  startSafetyNetCron();

  // 4. Daily reminder emails
  startReminderJob();
};