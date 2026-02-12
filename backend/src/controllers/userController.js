import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── GET ALL USERS ────────────────────────────────────────────────────────────
export const getUsers = asyncHandler(async (req, res) => {
  const { department, role, status, page = 1, limit = 20 } = req.query;

  const filter = {};

  // Filter by query params
  if (department) filter.department = department;
  if (role)       filter.role       = role;
  if (status)     filter.status     = status;

  // If caller is SUPERVISOR, only show their employees
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
export const getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .populate('supervisorId', 'name email')
    .lean();

  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', data: { user } });
});

// ─── GET MY PROFILE ─────────────────────────────────────────────────────────
export const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .populate('supervisorId', 'name email')
    .lean();

  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', data: { user } });
});

// ─── UPDATE USER ─────────────────────────────────────────────────────────────
export const updateUser = asyncHandler(async (req, res, next) => {
  const allowedFields = [
    'name',
    'position',
    'department',
    'supervisorId',
    'role',
    'status'
  ];

  const updates = {};

  allowedFields.forEach((field) => {
    const value = req.body[field];

    // Ignore empty string for supervisorId
    if (field === 'supervisorId') {
      if (value === '' || value === null) {
        updates.supervisorId = null; // or skip entirely
      } else if (value !== undefined) {
        updates.supervisorId = value;
      }
    } else {
      if (value !== undefined) {
        updates[field] = value;
      }
    }
  });

  if (Object.keys(updates).length === 0) {
    return next(new AppError('No valid fields to update.', 400));
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true, runValidators: true }
  ).populate('supervisorId', 'name email');

  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({
    status: 'success',
    data: { user: user.toPublic() }
  });
});


// ─── SOFT DELETE ──────────────────────────────────────────────────────────────
export const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: 'INACTIVE' },
    { new: true, runValidators: true }
  );
  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', message: 'User deactivated.' });
});

// ─── GET EMPLOYEES UNDER A SUPERVISOR ────────────────────────────────────────
export const getSupervisorEmployees = asyncHandler(async (req, res) => {
  const supervisorId = req.params.id;

  const employees = await User.find({ supervisorId })
    .populate('supervisorId', 'name email employeeId') 
    .lean();

  res.status(200).json({
    status: 'success',
    data: { teamMembers: employees }
  });
});