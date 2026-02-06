/* models/Result.js
 * Result(ResultID, UserID, CompetencyID, FinalScore, Level, Recommendation)
 *
 * Created by the scoring service once an assessment is fully submitted and
 * evaluated.  One Result document per (employee × competency × assessment).
 *
 * The recommendation field stores the text looked up from the Recommendation
 * collection at scoring time – this is a snapshot so that future changes to
 * the Recommendation collection do not retroactively alter historical results.
 */
const mongoose = require('mongoose');

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

const resultSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'User ID is required.'],
    },
    assessmentId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Assessment',
      required: [true, 'Assessment ID is required.'],
    },
    competencyId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Competency',
      required: [true, 'Competency ID is required.'],
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
    // Snapshot of recommendation text at time of scoring
    recommendation: {
      type:    String,
      default: '',
    },
    // Status: PENDING (manual review needed) | FINAL
    status: {
      type:    String,
      enum:    ['PENDING', 'FINAL'],
      default: 'FINAL',
    },
  },
  { timestamps: true, strict: true }
);

resultSchema.index({ userId: 1, competencyId: 1 });
resultSchema.index({ assessmentId: 1 });
resultSchema.index({ userId: 1, assessmentId: 1, competencyId: 1 }, { unique: true });

module.exports = mongoose.model('Result', resultSchema);
