/* controllers/userController.js
 * User management endpoints.
 *
 * GET    /users              – list users (HR_ADMIN; supports filter by dept/role)
 * GET    /users/:id          – get single user
 * GET    /users/me           – current user's own profile
 * PUT    /users/:id          – update user (HR_ADMIN)
 * DELETE /users/:id          – soft-delete (set status INACTIVE) (HR_ADMIN)
 * GET    /users/supervisor/:id/employees – employees assigned to a supervisor
 */
const User         = require('../models/User');
const AppError     = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// ─── GET ALL USERS ────────────────────────────────────────────────────────────
exports.getUsers = asyncHandler(async (req, res) => {
  const { department, role, status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (department) filter.department = department;
  if (role)       filter.role       = role;
  if (status)     filter.status     = status;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [users, total] = await Promise.all([
    User.find(filter)
      .populate('supervisorId', 'name email')
      .skip(skip)
      .limit(parseInt(limit, 10))
      .sort({ createdAt: -1 })
      .lean(),
    User.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      users: users.map((u) => ({
        _id:          u._id,
        employeeId:   u.employeeId,
        name:         u.name,
        email:        u.email,
        role:         u.role,
        position:     u.position,
        department:   u.department,
        supervisorId: u.supervisorId,
        status:       u.status,
        createdAt:    u.createdAt,
      })),
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
});

// ─── GET SINGLE USER ─────────────────────────────────────────────────────────
exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .populate('supervisorId', 'name email')
    .lean();

  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', data: { user } });
});

// ─── GET MY PROFILE ─────────────────────────────────────────────────────────
exports.getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .populate('supervisorId', 'name email')
    .lean();

  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', data: { user } });
});

// ─── UPDATE USER ─────────────────────────────────────────────────────────────
exports.updateUser = asyncHandler(async (req, res, next) => {
  const allowedFields = ['name', 'position', 'department', 'supervisorId', 'role', 'status'];
  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  if (Object.keys(updates).length === 0) {
    return next(new AppError('No valid fields to update.', 400));
  }

  const user = await User.findByIdAndUpdate(req.params.id, updates, {
    new:           true,
    runValidators: true,
  }).populate('supervisorId', 'name email');

  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', data: { user: user.toPublic() } });
});

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: 'INACTIVE' },
    { new: true, runValidators: true }
  );
  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', message: 'User deactivated.' });
});

// ─── GET EMPLOYEES UNDER A SUPERVISOR ────────────────────────────────────────
exports.getSupervisorEmployees = asyncHandler(async (req, res, next) => {
  const supervisorId = req.params.id;

  // If caller is a SUPERVISOR, they can only see their own subordinates
  if (req.user.role === 'SUPERVISOR' && req.user.id !== supervisorId) {
    return next(new AppError('Access denied.', 403));
  }

  const employees = await User.find({
    supervisorId,
    status: 'ACTIVE',
  })
    .select('-passwordHash -refreshToken -passwordResetToken -passwordResetExpires')
    .sort({ name: 1 })
    .lean();

  res.status(200).json({ status: 'success', data: { employees } });
});
