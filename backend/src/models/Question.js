// models/Question.js
import mongoose from 'mongoose';

export const QUESTION_TYPES = [
  'MCQ', 'Rating', 'TrueFalse', 'MultiSelect',
  'Matching', 'Ordering', 'ScenarioMCQ', 'DragDropClassification',
];

const questionSchema = new mongoose.Schema(
  {
    competencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competency',
      required: [true, 'Competency is required.'],
    },

    targetGroup: {
      type: String,
      required: [true, 'Target group is required.'],
      enum: ['managerial', 'non-managerial', 'common'],
    },

    type: {
      type: String,
      required: [true, 'Question type is required.'],
      enum: QUESTION_TYPES,
    },

    text: { type: String, required: true, trim: true, maxlength: 2000 },
    score: { type: Number, default: 1, min: 0.5 },

    
    options: { type: [String], default: [] },
    correctAnswer: { type: String, default: null, select: false },
    correctAnswers: { type: [String], default: [], select: false },
    scenario: { type: String, default: '', trim: true, maxlength: 5000 },
    matchingPairs: { type: [{ left: String, right: String }], default: [], select: false },
    correctOrder: { type: [String], default: [], select: false },
    categories: { type: mongoose.Schema.Types.Mixed, default: null, select: false },

    // derived/shuffled fields
    matchingLeft: { type: [String], default: [] },
    matchingRight: { type: [String], default: [] },
    orderItems: { type: [String], default: [] },
    classificationItems: { type: [String], default: [] },
    categoryNames: { type: [String], default: [] },
  },
  { timestamps: true, strict: true }
);

questionSchema.index({ competencyId: 1, targetGroup: 1 });
questionSchema.index({ competencyId: 1, type: 1, targetGroup: 1 });

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────
// VALIDATION + DERIVED FIELDS
// ─────────────────────────────────────────────
questionSchema.pre('save', function (next) {
  // Force TrueFalse options
  if (this.type === 'TrueFalse') {
    this.options = ['True', 'False'];
  }

  // ───────── MCQ / ScenarioMCQ ─────────
  if (['MCQ', 'ScenarioMCQ'].includes(this.type)) {
    if (!this.correctAnswer)
      return next(new Error('correctAnswer is required.'));
    if (!this.options || this.options.length < 2)
      return next(new Error('At least 2 options required.'));
  }

  if (this.type === 'ScenarioMCQ' && !this.scenario) {
    return next(new Error('Scenario text is required.'));
  }

  // ───────── MultiSelect ─────────
  if (this.type === 'MultiSelect') {
    if (!this.correctAnswers || this.correctAnswers.length === 0)
      return next(new Error('correctAnswers required.'));
    if (!this.options || this.options.length < 2)
      return next(new Error('At least 2 options required.'));
  }

  // ───────── Matching ─────────
  if (this.type === 'Matching') {
    if (!this.matchingPairs || this.matchingPairs.length < 2)
      return next(new Error('At least 2 matching pairs required.'));

    this.matchingLeft = shuffle(this.matchingPairs.map(p => p.left));
    this.matchingRight = shuffle(this.matchingPairs.map(p => p.right));
  }

  // ───────── Ordering ─────────
  if (this.type === 'Ordering') {
    if (!this.correctOrder || this.correctOrder.length < 2)
      return next(new Error('At least 2 items required for ordering.'));

    this.orderItems = shuffle(this.correctOrder);
  }

  // ───────── DragDrop ─────────
  if (this.type === 'DragDropClassification') {
    if (!this.categories || typeof this.categories !== 'object')
      return next(new Error('Categories object required.'));

    const catNames = Object.keys(this.categories);

    if (catNames.length < 2)
      return next(new Error('At least 2 categories required.'));

    const allItems = [];

    for (const cat of catNames) {
      const items = this.categories[cat] || [];
      if (!Array.isArray(items) || items.length === 0)
        return next(new Error(`Category "${cat}" must have items.`));

      allItems.push(...items);
    }

    if (allItems.length < 2)
      return next(new Error('At least 2 total items required.'));

    this.categoryNames = catNames;
    this.classificationItems = shuffle(allItems);
  }

  if (this.score <= 0) this.score = 1;

  next();
});

export default mongoose.model('Question', questionSchema);