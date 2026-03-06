/* models/User.js */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES   = ['HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'];
export const STATUS  = ['ACTIVE', 'INACTIVE'];
export const GENDERS = ['Male', 'Female'];

const userSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: [true, 'Employee ID is required.'],
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      maxlength: 100,
    },
    // ── Username (new) ────────────────────────────────────────────────────────
    username: {
      type: String,
      required: [true, 'Username is required.'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters.'],
      maxlength: [30, 'Username cannot exceed 30 characters.'],
      match: [/^[a-z0-9._-]+$/, 'Username may only contain letters, numbers, dots, hyphens, and underscores.'],
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email.'],
    },
    passwordHash: {
      type: String,
      select: false,
      required: [true, 'Password is required.'],
    },

    // ── Multi-role support ───────────────────────────────────────────────────
    roles: {
      type: [{ type: String, enum: ROLES }],
      default: ['EMPLOYEE'],
      validate: {
        validator: (arr) => arr.length >= 1 && arr.length <= 3,
        message: 'A user must have between 1 and 3 roles.',
      },
    },

    gender: {
      type: String,
      enum: GENDERS,
      default: null,
    },

    position:   { type: String, trim: true, maxlength: 100 },
    department: { type: String, trim: true, maxlength: 100 },
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: STATUS,
      default: 'ACTIVE',
    },

    // Token rotation
    refreshToken: { type: String, select: false, default: null },

    // Password reset
    passwordResetToken:   { type: String, select: false, default: null },
    passwordResetExpires: { type: Date,   select: false, default: null },

    // Account lockout
    failedLoginAttempts: { type: Number, select: false, default: 0 },
    lockUntil:           { type: Date,   select: false, default: null },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// ─── Indexes ────────────────────────────────────────────────────────────────
userSchema.index({ supervisorId: 1 });
userSchema.index({ department: 1, status: 1 });
userSchema.index({ roles: 1 });

// ─── Virtual: primary / default role ─────────────────────────────────────────
const ROLE_PRIORITY = { HR_ADMIN: 0, SUPERVISOR: 1, EMPLOYEE: 2 };

userSchema.virtual('defaultRole').get(function () {
  if (!this.roles || this.roles.length === 0) return 'EMPLOYEE';
  return [...this.roles].sort(
    (a, b) => (ROLE_PRIORITY[a] ?? 99) - (ROLE_PRIORITY[b] ?? 99)
  )[0];
});

// ─── Pre-save: hash password only when modified ──────────────────────────────
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// ─── Compare plain password with hash ───────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePlain) {
  return bcrypt.compare(candidatePlain, this.passwordHash);
};

// ─── Return safe public representation ──────────────────────────────────────
userSchema.methods.toPublic = function () {
  return {
    _id:          this._id,
    employeeId:   this.employeeId,
    name:         this.name,
    username:     this.username,
    email:        this.email,
    roles:        this.roles,
    defaultRole:  this.defaultRole,
    gender:       this.gender,
    position:     this.position,
    department:   this.department,
    supervisorId: this.supervisorId,
    status:       this.status,
    createdAt:    this.createdAt,
    updatedAt:    this.updatedAt,
  };
};

export default mongoose.model('User', userSchema);
