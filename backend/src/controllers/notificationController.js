/* controllers/notificationController.js */
import Notification from '../models/Notification.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── GET my notifications (paginated, newest first) ───────────────────────────
export const getMyNotifications = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
  const page   = Math.max(parseInt(req.query.page)  || 1, 1);
  const skip   = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ userId }),
    Notification.countDocuments({ userId, read: false }),
  ]);

  res.status(200).json({
    status: 'success',
    data: { notifications, total, unreadCount, page, limit },
  });
});

// ─── GET unread count only (lightweight, for polling) ────────────────────────
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ userId: req.user.id, read: false });
  res.status(200).json({ status: 'success', data: { count } });
});

// ─── MARK ONE as read ─────────────────────────────────────────────────────────
export const markRead = asyncHandler(async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { read: true, readAt: new Date() }
  );
  res.status(200).json({ status: 'success' });
});

// ─── MARK ALL as read ─────────────────────────────────────────────────────────
export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { userId: req.user.id, read: false },
    { read: true, readAt: new Date() }
  );
  res.status(200).json({ status: 'success' });
});

// ─── DELETE one notification ──────────────────────────────────────────────────
export const deleteNotification = asyncHandler(async (req, res) => {
  await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  res.status(200).json({ status: 'success' });
});

// ─── DELETE all read notifications ───────────────────────────────────────────
export const clearRead = asyncHandler(async (req, res) => {
  await Notification.deleteMany({ userId: req.user.id, read: true });
  res.status(200).json({ status: 'success' });
});