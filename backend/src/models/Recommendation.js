/* models/Recommendation.js
 * Recommendation(RecommendationId, CompetencyID, Level, Recommendation)
 *
 * Each competency × level combination has exactly one recommendation text.
 * The gap-analysis / PDP service looks up the employee's result level for
 * each competency and joins this collection to build the PDP.
 *
 * Levels match the scoring engine: Basic | Intermediate | Advanced | Expert
 */
const mongoose = require('mongoose');

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

const recommendationSchema = new mongoose.Schema(
  {
    competencyId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Competency',
      required: [true, 'Competency ID is required.'],
    },
    level: {
      type:     String,
      required: [true, 'Level is required.'],
      enum:     LEVELS,
    },
    recommendation: {
      type:     String,
      required: [true, 'Recommendation text is required.'],
      trim:     true,
      maxlength: 1000,
    },
  },
  { timestamps: true, strict: true }
);

// A competency can only have one recommendation per level.
recommendationSchema.index({ competencyId: 1, level: 1 }, { unique: true });

module.exports = mongoose.model('Recommendation', recommendationSchema);
