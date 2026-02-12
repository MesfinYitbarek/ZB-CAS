/* models/Report.js
 * Immutable snapshot of assessment results for reporting/history
 * Converted to ES Modules
 */
import mongoose from 'mongoose';

export const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

const reportSchema = new mongoose.Schema(
  {
    // Snapshot of user info at report-generation time
    user: {
      userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name:       { type: String, required: true },
      department: { type: String, default: '' },
      position:   { type: String, default: '' },
      email:      { type: String, default: '' },
    },
    // Snapshot of competency info
    competencyName: {
      type:     String,
      required: [true, 'Competency name is required.'],
    },
    competencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'Competency',
    },
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'Assessment',
    },
    finalScore: {
      type:     Number,
      required: [true, 'Final score is required.'],
      min:      0,
      max:      100,
    },
    level: {
      type:     String,
      required: [true, 'Level is required.'],
      enum:     LEVELS,
    },
    recommendation: {
      type:    String,
      default: '',
    },
    // When the report was generated (separate from Mongoose timestamps for clarity)
    generatedAt: {
      type:    Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    strict: true,
    // Reports should never be modified after creation
    // (enforced at the application layer – no update routes)
  }
);

/* ─── INDEXES ─────────────────────────────────────────────────────────────── */
reportSchema.index({ 'user.userId': 1 });
reportSchema.index({ assessmentId: 1 });
reportSchema.index({ 'user.department': 1, generatedAt: -1 });
reportSchema.index({ competencyId: 1, generatedAt: -1 });

export default mongoose.model('Report', reportSchema);
