/* models/Recommendation.js
 * Recommendation(RecommendationId, CompetencyID, Level, Recommendation)
 * ES Module version
 */
import mongoose from 'mongoose';

export const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

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

export default mongoose.model('Recommendation', recommendationSchema);
