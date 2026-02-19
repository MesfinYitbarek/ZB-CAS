/* models/SecurityViolation.js */
import mongoose from 'mongoose';

const violationEntrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    details: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const securityViolationSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    violations: [violationEntrySchema],

    summary: {
      totalViolations: { type: Number, default: 0 },
      tabSwitches: { type: Number, default: 0 },
      copyAttempts: { type: Number, default: 0 },
      rightClickAttempts: { type: Number, default: 0 },
      fullscreenExits: { type: Number, default: 0 },
      devToolsAttempts: { type: Number, default: 0 },
      windowBlurs: { type: Number, default: 0 },
      printAttempts: { type: Number, default: 0 },
      isHighRisk: { type: Boolean, default: false },
    },

    /* Full security log snapshot sent on assessment submission */
    securityLog: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    submittedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/* ─── INDEXES ──────────────────────────────────────────────────────────────── */

// One security record per assessment per user
securityViolationSchema.index(
  { assessmentId: 1, userId: 1 },
  { unique: true }
);

// Quick look-up for flagged records
securityViolationSchema.index({ 'summary.isHighRisk': 1 });

// Admin: list all violations for an assessment
securityViolationSchema.index({ assessmentId: 1 });

export default mongoose.model('SecurityViolation', securityViolationSchema);
