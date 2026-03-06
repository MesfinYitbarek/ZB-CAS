/* routes/chatRoutes.js */
import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getHRAdmins,
  getConversation,
  sendMessage,
  getConversations,
  getUnreadCount,
} from '../controllers/chatController.js';

const router = Router();

// All routes require authentication
router.use(protect);

// Get available HR admins for employees to chat with
router.get('/admins', getHRAdmins);

// Get user's conversations (inbox)
router.get('/conversations', getConversations);

// Get unread message count
router.get('/unread', getUnreadCount);

// Get conversation with specific user
router.get('/conversation/:userId', getConversation);

// Send message
router.post('/send', sendMessage);

export default router;
