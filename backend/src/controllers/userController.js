/* controllers/userController.js */
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── GET ALL USERS ────────────────────────────────────────────────────────────
export const getUsers = asyncHandler(async (req, res) => {
  const { department, role, status, page = 1, limit = 20, search } = req.query;

  const filter = {};

  // `role` query param now filters on the roles array
  if (department) filter.department = department;
  if (role)       filter.roles      = role;           // array field: {roles: 'SUPERVISOR'} matches docs where roles contains 'SUPERVISOR'
  if (status)     filter.status     = status;

  // Full-text–style search on name / email / employeeId
  if (search) {
    const re = new RegExp(search, 'i');
    filter.$or = [{ name: re }, { email: re }, { employeeId: re }];
  }

  // SUPERVISOR sees only their own employees
  if (req.user.role === 'SUPERVISOR') {
    filter.supervisorId = req.user.id;
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [users, total] = await Promise.all([
    User.find(filter)
      .populate('supervisorId', 'name email employeeId')
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
        roles:        u.roles,
        gender:       u.gender,
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
export const getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .populate('supervisorId', 'name email')
    .lean();

  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', data: { user } });
});

// ─── GET MY PROFILE ──────────────────────────────────────────────────────────
export const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .populate('supervisorId', 'name email')
    .lean();

  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', data: { user } });
});

// ─── GET SUPERVISOR EMPLOYEES ─────────────────────────────────────────────────
export const getSupervisorEmployees = asyncHandler(async (req, res, next) => {
  const employees = await User.find({ supervisorId: req.params.id, status: 'ACTIVE' })
    .populate('supervisorId', 'name email')
    .lean();

  res.status(200).json({
    status: 'success',
    data: { employees },
  });
});

// ─── UPDATE USER ──────────────────────────────────────────────────────────────
export const updateUser = asyncHandler(async (req, res, next) => {
  const allowedFields = [
    'name',
    'position',
    'department',
    'supervisorId',
    'roles',
    'gender',
    'status',
  ];

  const updates = {};

  allowedFields.forEach((field) => {
    const value = req.body[field];

    if (field === 'supervisorId') {
      if (value === '' || value === null) {
        updates.supervisorId = null;
      } else if (value !== undefined) {
        updates.supervisorId = value;
      }
    } else if (field === 'roles') {
      if (value !== undefined) {
        // Accept array or single string
        updates.roles = Array.isArray(value) ? value : [value];
      }
    } else {
      if (value !== undefined) updates[field] = value;
    }
  });

  if (Object.keys(updates).length === 0) {
    return next(new AppError('No valid fields to update.', 400));
  }

  const user = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  }).populate('supervisorId', 'name email');

  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({
    status: 'success',
    data: { user: user.toPublic() },
  });
});

// ─── SOFT DELETE ─────────────────────────────────────────────────────────────
export const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: 'INACTIVE' },
    { new: true, runValidators: true }
  );
  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', message: 'User deactivated.' });
});
