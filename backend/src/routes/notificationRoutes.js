/* routes/notificationRoutes.js */
import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getMyNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
  clearRead,
} from '../controllers/notificationController.js';

const router = Router();
router.use(protect);

router.get('/',              getMyNotifications);
router.get('/unread-count',  getUnreadCount);
router.patch('/read-all',    markAllRead);
router.patch('/:id/read',    markRead);
router.delete('/clear-read', clearRead);
router.delete('/:id',        deleteNotification);

export default router;