/* models/User.js
 * Mongoose schema for the User collection.
 * Now using ES Modules (import/export)
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'];
export const STATUS = ['ACTIVE', 'INACTIVE'];

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
    role: {
      type: String,
      enum: ROLES,
      default: 'EMPLOYEE',
    },
    position: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    department: {
      type: String,
      trim: true,
      maxlength: 100,
    },
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
    refreshToken: {
      type: String,
      select: false,
      default: null,
    },
    // Password reset
    passwordResetToken: {
      type: String,
      select: false,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// ─── Indexes ────────────────────────────────────────────────────────────────
userSchema.index({ supervisorId: 1 });
userSchema.index({ department: 1, status: 1 });

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

// ─── Return safe public representation ─────────────────────────────────────
userSchema.methods.toPublic = function () {
  return {
    _id: this._id,
    employeeId: this.employeeId,
    name: this.name,
    email: this.email,
    role: this.role,
    position: this.position,
    department: this.department,
    supervisorId: this.supervisorId,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('User', userSchema);
