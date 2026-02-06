/* models/User.js
 * Mongoose schema for the User collection.
 *
 * Maps to the document's:
 *   User(UserID, EmployeeID, Name, Email, Position, DepartmentName,
 *        SupervisorID, Status)
 *
 * Extras added for auth / security:
 *   role            – RBAC (HR_ADMIN | SUPERVISOR | EMPLOYEE)
 *   passwordHash    – bcrypt hash; select:false so it never leaks in queries
 *   refreshToken    – stored server-side for token rotation
 *   passwordResetToken / passwordResetExpires – for forgot-password flow
 *
 * OWASP:
 *   – Passwords are hashed (bcrypt, cost 12) in a pre-save hook.
 *   – passwordHash is select:false – never returned unless explicitly selected.
 *   – refreshToken is select:false.
 */
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const ROLES = ['HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'];
const STATUS = ['ACTIVE', 'INACTIVE'];

const userSchema = new mongoose.Schema(
  {
    employeeId: {
      type:     String,
      required: [true, 'Employee ID is required.'],
      unique:   true,
      trim:     true,
    },
    name: {
      type:     String,
      required: [true, 'Name is required.'],
      trim:     true,
      maxlength: 100,
    },
    email: {
      type:     String,
      required: [true, 'Email is required.'],
      unique:   true,
      lowercase: true,
      trim:     true,
      match:    [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email.'],
    },
    passwordHash: {
      type:   String,
      select: false,                          // never returned in queries
      required: [true, 'Password is required.'],
    },
    role: {
      type:    String,
      enum:    ROLES,
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
      ref:  'User',
      default: null,
    },
    status: {
      type:    String,
      enum:    STATUS,
      default: 'ACTIVE',
    },
    // ── token rotation ──────────────────────────────────────────────
    refreshToken: {
      type:   String,
      select: false,
      default: null,
    },
    // ── password reset ──────────────────────────────────────────────
    passwordResetToken: {
      type:   String,
      select: false,
      default: null,
    },
    passwordResetExpires: {
      type:   Date,
      select: false,
      default: null,
    },
  },
  {
    timestamps: true,           // createdAt, updatedAt
    // Ensure Mongoose doesn't let __proto__ / constructor / prototype through
    strict: true,
  }
);

// ─── indexes ─────────────────────────────────────────────────────────────────
userSchema.index({ supervisorId: 1 });
userSchema.index({ department: 1, status: 1 });

// ─── pre-save: hash password only when it has been modified ──────────────────
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);  // cost 12
  next();
});

// ─── instance method: compare plain password to hash ─────────────────────────
userSchema.methods.comparePassword = async function (candidatePlain) {
  // select:false means passwordHash is not loaded; we must explicitly select it.
  // But if the caller already selected it (e.g. .select('+passwordHash')),
  // this.passwordHash will be available.
  return bcrypt.compare(candidatePlain, this.passwordHash);
};

// ─── instance method: return a safe public representation ────────────────────
userSchema.methods.toPublic = function () {
  return {
    _id:          this._id,
    employeeId:   this.employeeId,
    name:         this.name,
    email:        this.email,
    role:         this.role,
    position:     this.position,
    department:   this.department,
    supervisorId: this.supervisorId,
    status:       this.status,
    createdAt:    this.createdAt,
    updatedAt:    this.updatedAt,
  };
};

module.exports = mongoose.model('User', userSchema);
