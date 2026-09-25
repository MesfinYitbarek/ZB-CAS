/* routes/userRoutes.js */
import express from 'express';
import multer from 'multer';
import { protect, authorize } from '../middleware/auth.js';
import * as userCtrl from '../controllers/userController.js';

const router = express.Router();

// In-memory multer for bulk user import (Excel / CSV only).
const allowedImportTypes = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = allowedImportTypes.has(file.mimetype) || /\.(xlsx|xls|csv|txt)$/i.test(file.originalname);
    if (ok) return cb(null, true);
    const err = new Error('Invalid file type. Only .xlsx, .xls, and .csv are allowed.');
    err.statusCode = 400;
    err.status = 'fail';
    cb(err, false);
  },
});

// All user routes require authentication
router.use(protect);

// ── Read endpoints (role checks inside controller where needed) ──────────────
router.get('/me', userCtrl.getMe);
router.get('/', authorize('HR_ADMIN'), userCtrl.getUsers);
router.get('/import/template', authorize('HR_ADMIN'), userCtrl.downloadImportTemplate);
router.get('/supervisor/:id/employees', authorize('HR_ADMIN', 'SUPERVISOR'), userCtrl.getSupervisorEmployees);
router.get('/:id', authorize('HR_ADMIN', 'SUPERVISOR'), userCtrl.getUser);

// ── Write endpoints – HR_ADMIN only ──────────────────────────────────────────
router.post('/import', authorize('HR_ADMIN'), upload.single('file'), userCtrl.bulkImportUsers);
router.patch('/bulk-status', authorize('HR_ADMIN'), userCtrl.bulkUpdateUserStatus);
router.post('/bulk-delete', authorize('HR_ADMIN'), userCtrl.bulkDeleteUsers);
router.put('/:id', authorize('HR_ADMIN'), userCtrl.updateUser);
router.delete('/:id', authorize('HR_ADMIN'), userCtrl.deleteUser);

export default router;
