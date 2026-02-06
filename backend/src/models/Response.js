/* models/Response.js
 * Response(ResponseID, AssessmentID, QuestionID, UserID, Score)
 *
 * Extended with:
 *   selectedAnswer  – what the user actually picked / typed
 *   manualScore     – filled by HR admin for ShortAnswer questions
 *   respondentType  – 'self' | 'supervisor'  (needed for Combined weighting)
 *   submittedAt     – when the full assessment was submitted
 *
 * Auto-save: responses are upserted as the user progresses, so partial
 * progress is never lost.
 */
const mongoose = require('mongoose');

const RESPONDENT_TYPES = ['self', 'supervisor'];

const responseSchema = new mongoose.Schema(
  {
    assessmentId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Assessment',
      required: [true, 'Assessment ID is required.'],
    },
    questionId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Question',
      required: [true, 'Question ID is required.'],
    },
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'User ID is required.'],
    },
    // The target employee (for supervisor assessments, this differs from userId)
    employeeId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'Employee ID is required.'],
    },
    selectedAnswer: {
      type: mongoose.Schema.Types.Mixed,   // String | Number depending on qType
      default: null,
    },
    score: {
      type:    Number,
      default: 0,
    },
    // HR admin fills this in for ShortAnswer questions
    manualScore: {
      type:    Number,
      default: null,
    },
    respondentType: {
      type:     String,
      required: [true, 'Respondent type is required.'],
      enum:     RESPONDENT_TYPES,
    },
    submittedAt: {
      type:    Date,
      default: null,
    },
  },
  { timestamps: true, strict: true }
);

// A single user can answer each question only once per assessment
responseSchema.index(
  { assessmentId: 1, questionId: 1, userId: 1 },
  { unique: true }
);
responseSchema.index({ assessmentId: 1, userId: 1 });
responseSchema.index({ employeeId: 1, assessmentId: 1 });

module.exports = mongoose.model('Response', responseSchema);
