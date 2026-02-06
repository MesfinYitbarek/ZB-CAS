/* models/Question.js
 * Question(QuestionID, CompetencyID, Type, Text)
 *
 * Supported types (matches the doc's requirement for "different types of
 * questions handled smoothly" while keeping scoring automatable):
 *   MCQ          – options: [String], correctAnswer stored (select:false)
 *   Rating       – no options needed; answer is 1-5
 *   TrueFalse    – options always ["True","False"], correctAnswer stored
 *   ShortAnswer  – free-text; scored manually (manualReview flag)
 *
 * OWASP / integrity:
 *   correctAnswer is select:false so it is never returned to the client
 *   unless explicitly selected server-side (the scoring engine does this).
 */
const mongoose = require('mongoose');

const QUESTION_TYPES = ['MCQ', 'Rating', 'TrueFalse', 'ShortAnswer'];

const questionSchema = new mongoose.Schema(
  {
    competencyId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Competency',
      required: [true, 'Competency ID is required.'],
    },
    type: {
      type:     String,
      required: [true, 'Question type is required.'],
      enum:     QUESTION_TYPES,
    },
    text: {
      type:     String,
      required: [true, 'Question text is required.'],
      trim:     true,
      maxlength: 2000,
    },
    // MCQ / TrueFalse only
    options: {
      type:    [String],
      default: [],
    },
    // The correct answer – NEVER sent to the client
    correctAnswer: {
      type:   String,
      select: false,
      default: null,
    },
    // true when type === ShortAnswer (scoring engine skips auto-score)
    manualReview: {
      type:    Boolean,
      default: false,
    },
  },
  { timestamps: true, strict: true }
);

questionSchema.index({ competencyId: 1 });
questionSchema.index({ competencyId: 1, type: 1 });

// ─── pre-save validation ─────────────────────────────────────────────────────
questionSchema.pre('save', function (next) {
  if (this.type === 'TrueFalse') {
    this.options = ['True', 'False'];
  }
  if (this.type === 'ShortAnswer') {
    this.manualReview = true;
    this.correctAnswer = null;   // no correct answer for open-ended
  }
  if ((this.type === 'MCQ' || this.type === 'TrueFalse') && !this.correctAnswer) {
    return next(new Error('correctAnswer is required for MCQ and TrueFalse questions.'));
  }
  next();
});

module.exports = mongoose.model('Question', questionSchema);
