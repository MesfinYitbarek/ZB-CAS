/* controllers/chatController.js */
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';

const mapMsg = (m) => ({ ...m, _id: m.id });
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

  res.status(200).json({ status: 'success', data: admins });
});

// ─── GET CONVERSATION ────────────────────────────────────────────────────────
export const getConversation = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;

  const messages = await prisma.chatMessage.findMany({
    where: {
      OR: [
        { senderId: currentUserId, receiverId: userId },
        { senderId: userId, receiverId: currentUserId },
      ],
    },
    include,
    orderBy: { createdAt: 'asc' },
  });

  await prisma.chatMessage.updateMany({
    where: { senderId: userId, receiverId: currentUserId, read: false },
    data: { read: true, readAt: new Date() },
  });

  res.status(200).json({ status: 'success', data: messages.map(mapMsg) });
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

  res.status(201).json({ status: 'success', data: mapMsg(chatMessage) });
});

// ─── GET USER'S CONVERSATIONS (INBOX) ────────────────────────────────────────
export const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { role } = req.query;

  const messages = await prisma.chatMessage.findMany({
    where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    orderBy: { createdAt: 'desc' },
  });

  const partnerIds = new Set();
  messages.forEach((msg) => {
    const partnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
    partnerIds.add(partnerId);
  });

  const conversations = await Promise.all(
    Array.from(partnerIds).map(async (partnerId) => {
      const partner = await prisma.user.findUnique({
        where: { id: partnerId },
        select: { id: true, name: true, username: true, email: true, roles: true, status: true },
      });
      if (!partner) return null;

      const lastMessage = messages.find((msg) => msg.senderId === partnerId || msg.receiverId === partnerId);

      const unreadCount = await prisma.chatMessage.count({
        where: { senderId: partnerId, receiverId: userId, read: false },
      });

      return { partner, lastMessage, unreadCount };
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
