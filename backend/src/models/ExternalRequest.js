/* models/ExternalRequest.js
 * Stores incoming assessment requests from external systems (e.g. ZB_SP Succession Planning).
 * Status workflow: PENDING → IN_PROGRESS → COMPLETED → SYNCED
 */
import mongoose from 'mongoose';

const REQUEST_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SYNCED'];

const externalRequestSchema = new mongoose.Schema(
  {
    // ── Source system info ─────────────────────────────────────────────────────
    sourceSystem: {
      type: String,
      required: true,
      default: 'ZB_SP',
      trim: true,
    },
    sourceAssessmentId: {
      type: String,
      default: null,
      trim: true,
    },

    // ── Employee details (from ZB_SP) ──────────────────────────────────────────
    employeeName: {
      type: String,
      required: [true, 'Employee name is required.'],
      trim: true,
    },
    employeeEmail: {
      type: String,
      required: [true, 'Employee email is required.'],
      trim: true,
      lowercase: true,
    },
    positionTitle: {
      type: String,
      required: [true, 'Position title is required.'],
      trim: true,
    },

    // ── Competencies to assess ─────────────────────────────────────────────────
    competencies: [
      {
        name: { type: String, required: true, trim: true },
        type: { type: String, default: 'TECHNICAL', trim: true },
        requiredLevel: { 
          type: String, 
          enum: ['Basic', 'Intermediate', 'Advanced', 'Expert'], 
          default: 'Intermediate' 
        },
      },
    ],

    // ── Linking to ZB CAS internal records ─────────────────────────────────────
    linkedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    linkedAssessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      default: null,
    },

    // ── Status tracking ────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: REQUEST_STATUSES,
      default: 'PENDING',
    },

    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true, strict: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
externalRequestSchema.index({ status: 1 });
externalRequestSchema.index({ sourceSystem: 1, sourceAssessmentId: 1 });
externalRequestSchema.index({ employeeEmail: 1 });

export default mongoose.model('ExternalRequest', externalRequestSchema);
