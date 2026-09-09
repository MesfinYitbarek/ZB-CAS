/* controllers/notificationController.js */
import prisma from '../config/prisma.js';
import asyncHandler from '../utils/asyncHandler.js';

const toPayload = (n) => ({ ...n, _id: n.id });

// ─── GET my notifications (paginated, newest first) ───────────────────────────
export const getMyNotifications = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
  const page   = Math.max(parseInt(req.query.page)  || 1, 1);
  const skip   = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  res.status(200).json({
    status: 'success',
    data: { notifications: notifications.map(toPayload), total, unreadCount, page, limit },
  });
});

// ─── GET unread count only (lightweight, for polling) ────────────────────────
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.user.id, read: false } });
  res.status(200).json({ status: 'success', data: { count } });
});

// ─── MARK ONE as read ─────────────────────────────────────────────────────────
export const markRead = asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.id },
    data: { read: true, readAt: new Date() },
  });
  res.status(200).json({ status: 'success' });
});

// ─── MARK ALL as read ─────────────────────────────────────────────────────────
export const markAllRead = asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  res.status(200).json({ status: 'success' });
});

// ─── DELETE one notification ──────────────────────────────────────────────────
export const deleteNotification = asyncHandler(async (req, res) => {
  await prisma.notification.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
  res.status(200).json({ status: 'success' });
});

// ─── DELETE all read notifications ───────────────────────────────────────────
export const clearRead = asyncHandler(async (req, res) => {
  await prisma.notification.deleteMany({ where: { userId: req.user.id, read: true } });
  res.status(200).json({ status: 'success' });
});
