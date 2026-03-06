/* controllers/chatController.js */
import ChatMessage from '../models/ChatMessage.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';

// ─── GET AVAILABLE HR ADMINS ─────────────────────────────────────────────────
export const getHRAdmins = asyncHandler(async (req, res) => {
  const admins = await User.find({
    roles: 'HR_ADMIN',
    status: 'ACTIVE',
  }).select('name username email position department');

  res.status(200).json({
    status: 'success',
    data: admins,
  });
});

// ─── GET CONVERSATION ────────────────────────────────────────────────────────
export const getConversation = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;

  const messages = await ChatMessage.find({
    $or: [
      { sender: currentUserId, receiver: userId },
      { sender: userId, receiver: currentUserId },
    ],
  })
    .sort({ createdAt: 1 })
    .populate('sender', 'name username role')
    .populate('receiver', 'name username role');

  // Mark messages as read
  await ChatMessage.updateMany(
    { sender: userId, receiver: currentUserId, read: false },
    { read: true, readAt: new Date() }
  );

  res.status(200).json({
    status: 'success',
    data: messages,
  });
});

// ─── SEND MESSAGE ───────────────────────────────────────────────────────────
export const sendMessage = asyncHandler(async (req, res, next) => {
  const { receiverId, message } = req.body;
  const senderId = req.user.id;

  if (!receiverId || !message?.trim()) {
    return next(new AppError('Receiver and message are required', 400));
  }

  // Verify receiver exists and is active
  const receiver = await User.findById(receiverId);
  if (!receiver || receiver.status !== 'ACTIVE') {
    return next(new AppError('Receiver not found or inactive', 404));
  }

  const chatMessage = await ChatMessage.create({
    sender: senderId,
    receiver: receiverId,
    message: message.trim(),
  });

  // Populate for response
  const populatedMessage = await ChatMessage.findById(chatMessage._id)
    .populate('sender', 'name username')
    .populate('receiver', 'name username');

  logger.info({
    event: 'chat_message_sent',
    sender: senderId,
    receiver: receiverId,
  });

  res.status(201).json({
    status: 'success',
    data: populatedMessage,
  });
});

// ─── GET USER'S CONVERSATIONS (INBOX) ────────────────────────────────────────
export const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { role } = req.query;

  // Get all unique conversations
  const messages = await ChatMessage.find({
    $or: [{ sender: userId }, { receiver: userId }],
  }).sort({ createdAt: -1 });

  // Get unique conversation partners
  const partnerIds = new Set();
  messages.forEach((msg) => {
    const partnerId = msg.sender.toString() === userId ? msg.receiver.toString() : msg.sender.toString();
    partnerIds.add(partnerId);
  });

  // Get partner details and last message
  const conversations = await Promise.all(
    Array.from(partnerIds).map(async (partnerId) => {
      const partner = await User.findById(partnerId).select('name username email roles status');
      if (!partner) return null;

      const lastMessage = messages.find(
        (msg) =>
          msg.sender.toString() === partnerId || msg.receiver.toString() === partnerId
      );

      const unreadCount = await ChatMessage.countDocuments({
        sender: partnerId,
        receiver: userId,
        read: false,
      });

      return {
        partner,
        lastMessage,
        unreadCount,
      };
    })
  );

  // Filter out nulls and sort by last message date
  const validConversations = conversations
    .filter(Boolean)
    .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));

  res.status(200).json({
    status: 'success',
    data: validConversations,
  });
});

// ─── GET UNREAD COUNT ───────────────────────────────────────────────────────
export const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const count = await ChatMessage.countDocuments({
    receiver: userId,
    read: false,
  });

  res.status(200).json({
    status: 'success',
    data: { count },
  });
});
