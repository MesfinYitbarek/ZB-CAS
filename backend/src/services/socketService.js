/* services/socketService.js
 * Real-time chat via Socket.IO
 * - JWT auth on handshake
 * - Per-user rooms  (room = userId string)
 * - Events: message:send → message:new, message:read, typing:start/stop
 * - Online-presence: user:online / user:offline broadcast
 */
import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.js';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

/** Map<userId, Set<socketId>> — a user may have multiple tabs open */
const onlineUsers = new Map();

function addOnline(userId, socketId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
}

function removeOnline(userId, socketId) {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) onlineUsers.delete(userId);
}

export function isOnline(userId) {
  return onlineUsers.has(userId.toString());
}

export function getOnlineUsers() {
  return Array.from(onlineUsers.keys());
}

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── Auth middleware ──────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) return next(new Error('No token'));
    try {
      const decoded = verifyAccessToken(token);
      socket.userId = decoded.id;
      socket.userName = decoded.name || 'User';
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection ───────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.userId;

    // Join personal room so we can target this user directly
    socket.join(userId);
    addOnline(userId, socket.id);

    logger.info({ event: 'socket_connect', userId, socketId: socket.id });

    // Broadcast presence to everyone
    io.emit('user:online', { userId });

    // ── Send message ─────────────────────────────────────────────────────
    socket.on('message:send', async ({ receiverId, message }, ack) => {
      try {
        if (!receiverId || !message?.trim()) {
          return ack?.({ error: 'receiverId and message required' });
        }

        const saved = await prisma.chatMessage.create({
          data: {
            senderId: userId,
            receiverId,
            message: message.trim(),
          },
          include: {
            sender: { select: { id: true, name: true, username: true } },
            receiver: { select: { id: true, name: true, username: true } },
          },
        });

        const payload = { ...saved, _id: saved.id };

        // Deliver to receiver (their room) and back to sender
        io.to(receiverId).emit('message:new', payload);
        io.to(userId).emit('message:new', payload);

        logger.info({ event: 'message_sent', from: userId, to: receiverId });
        ack?.({ ok: true, data: payload });
      } catch (err) {
        logger.error({ event: 'message_send_error', err: err.message });
        ack?.({ error: 'Failed to send message' });
      }
    });

    // ── Mark as read ─────────────────────────────────────────────────────
    socket.on('message:read', async ({ senderId }) => {
      try {
        const result = await prisma.chatMessage.updateMany({
          where: { senderId, receiverId: userId, read: false },
          data: { read: true, readAt: new Date() },
        });
        if (result.count > 0) {
          // Notify the original sender their messages were read
          io.to(senderId).emit('message:read', { byUserId: userId });
        }
      } catch (err) {
        logger.error({ event: 'message_read_error', err: err.message });
      }
    });

    // ── Typing indicators ────────────────────────────────────────────────
    socket.on('typing:start', ({ receiverId }) => {
      socket.to(receiverId).emit('typing:start', { userId });
    });

    socket.on('typing:stop', ({ receiverId }) => {
      socket.to(receiverId).emit('typing:stop', { userId });
    });

    // ── Disconnect ───────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      removeOnline(userId, socket.id);
      if (!isOnline(userId)) {
        io.emit('user:offline', { userId });
        logger.info({ event: 'socket_disconnect', userId });
      }
    });
  });

  // Expose io globally so notificationService can push events without circular imports
  global._io = io;

  return io;
}