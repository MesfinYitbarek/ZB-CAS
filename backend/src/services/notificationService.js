/* services/notificationService.js
 *
 * Central helper for creating in-app notifications and pushing them
 * in real-time over Socket.IO.
 *
 * Usage:
 *   import { notify } from '../services/notificationService.js';
 *   await notify(userId, 'ASSESSMENT_ASSIGNED', 'New Assessment', 'Body text', '/assessments', { assessmentId });
 *
 * Socket push: if the user is currently connected, the notification is
 * emitted on their personal room immediately after DB insert.
 * Uses global._io set by socketService after server boot — no circular dep.
 */
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

/**
 * Create a notification and push it over Socket.IO if the user is online.
 *
 * @param {string} userId
 * @param {string}          type    — one of NOTIFICATION_TYPES
 * @param {string}          title   — short headline
 * @param {string}          [body]  — longer description
 * @param {string}          [link]  — frontend route to navigate to
 * @param {object}          [meta]  — arbitrary extra data
 * @returns {Notification}
 */
export const notify = async (userId, type, title, body = '', link = null, meta = null) => {
  try {
    const doc = await prisma.notification.create({
      data: { userId, type, title, body, link, meta },
    });

    // Push real-time to the user's socket room (room = userId string)
    const io = global._io;
    if (io) {
      io.to(String(userId)).emit('notification:new', {
        _id:       doc.id,
        id:        doc.id,
        type:      doc.type,
        title:     doc.title,
        body:      doc.body,
        link:      doc.link,
        read:      doc.read,
        createdAt: doc.createdAt,
      });
    }

    return doc;
  } catch (err) {
    // Notifications are best-effort — never crash the calling controller
    logger.error({ event: 'notification_create_error', err: err.message });
    return null;
  }
};

// ─── Convenience wrappers matching the 5 notification types ──────────────────

export const notifyAssessmentAssigned = (userId, assessmentDescription, assessmentId) =>
  notify(
    userId,
    'ASSESSMENT_ASSIGNED',
    'New assessment assigned',
    `"${assessmentDescription || 'Assessment'}" has been scheduled for you.`,
    '/assessments',
    { assessmentId }
  );

export const notifyResultReady = (userId, competencyName, score, level, resultId) =>
  notify(
    userId,
    'RESULT_READY',
    'Your results are ready',
    `${competencyName}: ${score}% — ${level}`,
    '/results',
    { resultId }
  );

export const notifySupervisorReminder = (supervisorId, employeeName, assessmentDescription, assessmentId) =>
  notify(
    supervisorId,
    'SUPERVISOR_REMINDER',
    'Evaluation pending',
    `Please evaluate ${employeeName} for "${assessmentDescription || 'Assessment'}".`,
    '/evaluations',
    { assessmentId }
  );

export const notifyDeadlineReminder = (userId, assessmentDescription, leadLabel, assessmentId) =>
  notify(
    userId,
    'DEADLINE_REMINDER',
    `Assessment deadline in ${leadLabel}`,
    `"${assessmentDescription || 'Assessment'}" is due soon.`,
    '/assessments',
    { assessmentId }
  );

export const notifyAccountCreated = (userId) =>
  notify(
    userId,
    'ACCOUNT_CREATED',
    'Welcome to Zemen Bank CAS',
    'Your account has been created. You can now access your assessments.',
    '/dashboard'
  );

export const notifySecurityAlert = (userId, title, body, assessmentId) =>
  notify(
    userId,
    'SECURITY_ALERT',
    title,
    body,
    '/assessments',
    assessmentId ? { assessmentId } : null
  );

export const notifyRetakeGranted = (userId, assessmentDescription, assessmentId) =>
  notify(
    userId,
    'RETAKE_GRANTED',
    'Retake access granted',
    `HR has granted you a retake for "${assessmentDescription || 'Assessment'}". You will receive a new set of questions.`,
    '/assessments',
    assessmentId ? { assessmentId } : null
  );