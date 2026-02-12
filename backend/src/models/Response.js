/* models/Response.js */
import mongoose from 'mongoose';

export const RESPONDENT_TYPES = ['self', 'supervisor'];

const responseSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
    },

    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    selectedAnswer: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    manualScore: {
      type: Number,
      default: null,
    },

    respondentType: {
      type: String,
      enum: RESPONDENT_TYPES,
      required: true,
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    comments: {
      type: String,
      default: '',
    },

    isSupervisorEvaluation: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

/* ─── UPDATED INDEXES ─────────────────────────────────────────────────────────────── */

// SELF: one answer per question per employee
responseSchema.index(
  { assessmentId: 1, questionId: 1, employeeId: 1, respondentType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      respondentType: 'self',
      questionId: { $exists: true },
    },
  }
);

// SUPERVISOR: one evaluation per assessment per employee per supervisor
// This allows the SAME supervisor to evaluate DIFFERENT employees for DIFFERENT assessments
responseSchema.index(
  { assessmentId: 1, employeeId: 1, userId: 1, respondentType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      respondentType: 'supervisor',
      isSupervisorEvaluation: true,
    },
  }
);

// Query helpers
responseSchema.index({ assessmentId: 1, userId: 1 });
responseSchema.index({ assessmentId: 1, employeeId: 1 });
responseSchema.index({ userId: 1, respondentType: 1 });

export default mongoose.model('Response', responseSchema);