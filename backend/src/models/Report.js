/* models/Report.js
 * Consolidated assessment report:
 *   One document per (assessmentId + userId) containing
 *   the full snapshot of that user's performance in that assessment,
 *   including per-competency scores, level, recommendation, and score details.
 */
import mongoose from 'mongoose';

export const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

// ── Embedded competency result inside a report ────────────────────────────────
const competencyResultSchema = new mongoose.Schema(
  {
    competencyId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Competency' },
    competencyName: { type: String, required: true },
    category:       { type: String, default: '' },

    finalScore:     { type: Number, required: true, min: 0, max: 100 },
    level:          { type: String, required: true, enum: LEVELS },
    recommendation: { type: String, default: '' },

    // Score breakdown
    scoreDetails: {
      selfScore:       { type: Number, default: 0 },
      supervisorScore: { type: Number, default: 0 },
      weightUsed: {
        selfAssessment: { type: Number, default: 0 },
        supervisor:     { type: Number, default: 0 },
      },
      calculation: { type: String, default: '' },
    },

    // Result reference (for deep linking)
    resultId: { type: mongoose.Schema.Types.ObjectId, ref: 'Result' },
  },
  { _id: true }
);

// ── Main report schema ────────────────────────────────────────────────────────
const reportSchema = new mongoose.Schema(
  {
    // ── User snapshot (captured at generation time) ───────────────────────
    user: {
      userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      name:       { type: String, required: true },
      email:      { type: String, default: '' },
      employeeId: { type: String, default: '' },
      department: { type: String, default: '' },
      position:   { type: String, default: '' },
      gender:     { type: String, default: '' },
    },

    // ── Assessment snapshot ───────────────────────────────────────────────
    assessment: {
      assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true },
      description:  { type: String, default: '' },
      type:         { type: String, default: '' },          // SelfAssessment | SupervisorOnly | Combined
      purpose:      { type: String, default: '' },
      targetGroup:  { type: String, default: '' },
      startDate:    { type: Date, default: null },
      endDate:      { type: Date, default: null },
    },

    // ── All competency results for this assessment/user pair ─────────────
    // (usually 1, but assessments can technically cover multiple competencies)
    competencyResults: [competencyResultSchema],

    // ── Aggregate roll-up (computed from competencyResults) ───────────────
    overallScore:  { type: Number, default: 0, min: 0, max: 100 },
    overallLevel:  { type: String, enum: LEVELS, default: 'Basic' },

    // ── Status ────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ['PARTIAL', 'COMPLETE'],
      default: 'COMPLETE',
    },

    generatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// ── Enforce uniqueness: one report per (user × assessment) ────────────────────
reportSchema.index({ 'user.userId': 1, 'assessment.assessmentId': 1 }, { unique: true });

// ── Additional query indexes ──────────────────────────────────────────────────
reportSchema.index({ 'user.userId': 1, generatedAt: -1 });
reportSchema.index({ 'assessment.assessmentId': 1 });
reportSchema.index({ 'user.department': 1, generatedAt: -1 });
reportSchema.index({ 'competencyResults.competencyId': 1 });
reportSchema.index({ overallLevel: 1 });
reportSchema.index({ overallScore: 1 });

export default mongoose.model('Report', reportSchema);
