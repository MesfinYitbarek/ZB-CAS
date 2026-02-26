import mongoose from 'mongoose';

export const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

const recommendationSchema = new mongoose.Schema(
  {
    competencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competency',
      required: [true, 'Competency ID is required'],
    },
    targetGroup: {
      type: String,
      required: [true, 'Target group is required'],
      enum: ['managerial', 'non-managerial', 'common'],
    },
    level: {
      type: String,
      required: [true, 'Level is required'],
      enum: LEVELS,
    },
    recommendation: {
      type: String,
      required: [true, 'Recommendation text is required'],
      trim: true,
      maxlength: 1000,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Compound unique index: one recommendation per competency + target group + level
recommendationSchema.index(
  { competencyId: 1, targetGroup: 1, level: 1 },
  { unique: true }
);

export default mongoose.model('Recommendation', recommendationSchema);