/* models/Response.js
 * Mongoose schema for storing assessment responses
 * Converted to ES Modules
 */

import mongoose from 'mongoose';

export const RESPONDENT_TYPES = ['self', 'supervisor'];

const responseSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
    },

    // ONLY used for SELF assessments
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null,
    },

    // Person who is answering (employee or supervisor)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Employee being evaluated
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

    // Marks single-score supervisor evaluation
    isSupervisorEvaluation: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

/* ─── INDEXES ─────────────────────────────────────────────────────────────── */

// SELF: one answer per question
responseSchema.index(
  { assessmentId: 1, questionId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      respondentType: 'self',
      questionId: { $ne: null },
    },
  }
);

// SUPERVISOR: one evaluation per employee
responseSchema.index(
  { assessmentId: 1, employeeId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      respondentType: 'supervisor',
    },
  }
);

// Query helpers
responseSchema.index({ assessmentId: 1, userId: 1 });
responseSchema.index({ assessmentId: 1, employeeId: 1 });

export default mongoose.model('Response', responseSchema);
