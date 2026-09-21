/* controllers/chatController.js */
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';

const withId = (u) => (u ? { ...u, _id: u.id } : u);
const mapMsg = (m) => ({ ...m, _id: m.id, sender: withId(m.sender), receiver: withId(m.receiver) });
const include = {
  sender: { select: { id: true, name: true, username: true, roles: true } },
  receiver: { select: { id: true, name: true, username: true, roles: true } },
};

// ─── GET AVAILABLE HR ADMINS ─────────────────────────────────────────────────
export const getHRAdmins = asyncHandler(async (req, res) => {
  const admins = await prisma.user.findMany({
    where: { roles: { has: 'HR_ADMIN' }, status: 'ACTIVE' },
    select: { id: true, name: true, username: true, email: true, position: true, department: true },
  });

  res.status(200).json({ status: 'success', data: admins.map(withId) });
});

// ─── GET CONVERSATION (cursor-paginated, Telegram-style) ─────────────────────
// Query: ?limit=30&before=<messageId> — returns the most recent `limit`
// messages (or the `limit` messages older than `before`), oldest-first, plus
// a hasMore flag. The client loads older chunks on scroll-up.
export const getConversation = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const { before } = req.query;

  let cursor = null;
  if (before) {
    cursor = await prisma.chatMessage.findUnique({
      where: { id: before },
      select: { id: true, createdAt: true },
    });
    if (!cursor) return next(new AppError('Cursor message not found.', 404));
  }

  const participantFilter = {
    OR: [
      { senderId: currentUserId, receiverId: userId },
      { senderId: userId, receiverId: currentUserId },
    ],
  };

  const rows = await prisma.chatMessage.findMany({
    where: {
      AND: [
        participantFilter,
        ...(cursor
          ? [{
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }]
          : []),
      ],
    },
    include,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).reverse();

  await prisma.chatMessage.updateMany({
    where: { senderId: userId, receiverId: currentUserId, read: false },
    data: { read: true, readAt: new Date() },
  });

  res.status(200).json({ status: 'success', data: { messages: page.map(mapMsg), hasMore } });
});

// ─── SEND MESSAGE ───────────────────────────────────────────────────────────
export const sendMessage = asyncHandler(async (req, res, next) => {
  const { receiverId, message } = req.body;
  const senderId = req.user.id;

  if (!receiverId || !message?.trim()) {
    return next(new AppError('Receiver and message are required', 400));
  }

  const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
  if (!receiver || receiver.status !== 'ACTIVE') {
    return next(new AppError('Receiver not found or inactive', 404));
  }

  const chatMessage = await prisma.chatMessage.create({
    data: { senderId, receiverId, message: message.trim() },
    include,
  });

  logger.info({ event: 'chat_message_sent', sender: senderId, receiver: receiverId });

  const payload = mapMsg(chatMessage);

  // Push live to both sides so REST senders behave exactly like socket sends.
  // global._io is set by socketService.initSocket; guarded for test contexts.
  try {
    global._io?.to(receiverId).emit('message:new', payload);
    global._io?.to(senderId).emit('message:new', payload);
  } catch (err) {
    logger.error({ event: 'chat_push_error', err: err.message });
  }

  res.status(201).json({ status: 'success', data: payload });
});

// ─── GET USER'S CONVERSATIONS (INBOX) ────────────────────────────────────────
// Scales with partner count, not message count: distinct partners first, then
// one latest-message + one unread-count query per partner (parallel).
export const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const [sentTo, receivedFrom] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { senderId: userId },
      select: { receiverId: true },
      distinct: ['receiverId'],
    }),
    prisma.chatMessage.findMany({
      where: { receiverId: userId },
      select: { senderId: true },
      distinct: ['senderId'],
    }),
  ]);

  const partnerIds = new Set([
    ...sentTo.map((m) => m.receiverId),
    ...receivedFrom.map((m) => m.senderId),
  ]);

  const conversations = await Promise.all(
    Array.from(partnerIds).map(async (partnerId) => {
      const [partner, lastMessage, unreadCount] = await Promise.all([
        prisma.user.findUnique({
          where: { id: partnerId },
          select: { id: true, name: true, username: true, email: true, roles: true, status: true },
        }),
        prisma.chatMessage.findFirst({
          where: {
            OR: [
              { senderId: userId, receiverId: partnerId },
              { senderId: partnerId, receiverId: userId },
            ],
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        prisma.chatMessage.count({
          where: { senderId: partnerId, receiverId: userId, read: false },
        }),
      ]);
      if (!partner || !lastMessage) return null;

      return { partner: withId(partner), lastMessage: mapMsg(lastMessage), unreadCount };
    })
  );

  const validConversations = conversations
    .filter(Boolean)
    .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));

  res.status(200).json({ status: 'success', data: validConversations });
});

// ─── GET UNREAD COUNT ───────────────────────────────────────────────────────
export const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const count = await prisma.chatMessage.count({ where: { receiverId: userId, read: false } });

  res.status(200).json({ status: 'success', data: { count } });
});
