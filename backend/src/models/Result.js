/* models/Result.js
 * Mongoose schema for storing assessment results
 * Converted to ES Modules
 */

import mongoose from 'mongoose';

export const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

const resultSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required.'],
    },
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: [true, 'Assessment ID is required.'],
    },
    competencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competency',
      required: [true, 'Competency ID is required.'],
    },
    finalScore: {
      type: Number,
      required: [true, 'Final score is required.'],
      min: 0,
      max: 100,
      default: 0,
    },
    level: {
      type: String,
      required: [true, 'Level is required.'],
      enum: LEVELS,
    },
    recommendation: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['PENDING', 'FINAL'],
      default: 'FINAL',
    },
    scoreDetails: {
      selfScore: { type: Number, default: null },
      supervisorScore: { type: Number, default: null },
      weightUsed: {
        selfAssessment: { type: Number, default: 0 },
        supervisor: { type: Number, default: 0 },
      },
      calculation: { type: String, default: '' },

      questionDetails: [{
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
        questionNumber: Number,
        questionText: String,
        questionType: String,
        maxScore: Number,
        options: [mongoose.Schema.Types.Mixed],
        userAnswer: mongoose.Schema.Types.Mixed,
        correctAnswer: mongoose.Schema.Types.Mixed,
        scoreAwarded: Number,
        scorePercentage: Number,
        isCorrect: Boolean,
        isPartial: Boolean,
        isUnanswered: Boolean
      }]
    },
  },
  { timestamps: true, strict: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────
resultSchema.index({ userId: 1, competencyId: 1 });
resultSchema.index({ assessmentId: 1 });
resultSchema.index({ userId: 1, assessmentId: 1, competencyId: 1 }, { unique: true });

export default mongoose.model('Result', resultSchema);
