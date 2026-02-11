/* models/Question.js
 * Question(QuestionID, CompetencyID, Type, Text, Score)
 *
 * Supported types (all auto-scorable unless noted):
 *   MCQ                    – single correct answer from options
 *   Rating                 – answer is 1-5
 *   TrueFalse              – options always ["True","False"]
 *   ShortAnswer            – free-text; scored manually (manualReview flag)
 *   MultiSelect            – multiple correct answers from options (partial credit)
 *   Matching               – pair left↔right items
 *   Ordering               – arrange items in correct sequence
 *   ScenarioMCQ            – scenario paragraph + MCQ
 *   DragDropClassification – classify items into named categories
 *
 * Each question carries a `score` (point value, default 1).
 *
 * OWASP / integrity:
 *   correctAnswer, correctAnswers, matchingPairs, correctOrder, categories
 *   are all select:false so they are never returned to the client
 *   unless explicitly selected server-side (the scoring engine does this).
 */
const mongoose = require('mongoose');

const QUESTION_TYPES = [
  'MCQ',
  'Rating',
  'TrueFalse',
  'ShortAnswer',
  'MultiSelect',
  'Matching',
  'Ordering',
  'ScenarioMCQ',
  'DragDropClassification',
];

const questionSchema = new mongoose.Schema(
  {
    competencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competency',
      required: [true, 'Competency ID is required.'],
    },
    type: {
      type: String,
      required: [true, 'Question type is required.'],
      enum: QUESTION_TYPES,
    },
    text: {
      type: String,
      required: [true, 'Question text is required.'],
      trim: true,
      maxlength: 2000,
    },

    // ─── Per-question point value ──────────────────────────────────────────
    score: {
      type: Number,
      default: 1,
      min: [0, 'Score must be non-negative.'],
    },

    // ─── MCQ / TrueFalse / MultiSelect / ScenarioMCQ ──────────────────────
    options: {
      type: [String],
      default: [],
    },

    // ─── MCQ / TrueFalse / ScenarioMCQ: single correct answer ─────────────
    correctAnswer: {
      type: String,
      select: false,
      default: null,
    },

    // ─── MultiSelect: multiple correct answers ────────────────────────────
    correctAnswers: {
      type: [String],
      select: false,
      default: [],
    },

    // ─── ScenarioMCQ: scenario/case-study paragraph ───────────────────────
    scenario: {
      type: String,
      default: '',
      trim: true,
      maxlength: 5000,
    },

    // ─── Matching: correct left→right pairings (hidden) ───────────────────
    //   Stored as [{left:"Term A", right:"Def A"}, …]
    matchingPairs: {
      type: [
        {
          left: { type: String, required: true },
          right: { type: String, required: true },
        },
      ],
      select: false,
      default: [],
    },
    // Shuffled columns shown to client
    matchingLeft: {
      type: [String],
      default: [],
    },
    matchingRight: {
      type: [String],
      default: [],
    },

    // ─── Ordering: correct sequence (hidden) ──────────────────────────────
    correctOrder: {
      type: [String],
      select: false,
      default: [],
    },
    // Items in a shuffled presentation order (client-visible)
    orderItems: {
      type: [String],
      default: [],
    },

    // ─── DragDropClassification: correct mapping (hidden) ─────────────────
    //   Stored as { "Category A": ["item1","item2"], "Category B": ["item3"] }
    categories: {
      type: mongoose.Schema.Types.Mixed,
      select: false,
      default: null,
    },
    // Client-visible: flat list of items + category names
    classificationItems: {
      type: [String],
      default: [],
    },
    categoryNames: {
      type: [String],
      default: [],
    },

    // ─── Manual review flag ────────────────────────────────────────────────
    manualReview: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, strict: true }
);

questionSchema.index({ competencyId: 1 });
questionSchema.index({ competencyId: 1, type: 1 });

// ─── Utility: Fisher-Yates shuffle ──────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── pre-save validation & auto-population ──────────────────────────────────
questionSchema.pre('save', function (next) {
  // --- TrueFalse ---
  if (this.type === 'TrueFalse') {
    this.options = ['True', 'False'];
  }

  // --- ShortAnswer ---
  if (this.type === 'ShortAnswer') {
    this.manualReview = true;
    this.correctAnswer = null;
  }

  // --- MCQ / TrueFalse / ScenarioMCQ require correctAnswer ---
  if (['MCQ', 'TrueFalse', 'ScenarioMCQ'].includes(this.type) && !this.correctAnswer) {
    return next(
      new Error('correctAnswer is required for MCQ, TrueFalse, and ScenarioMCQ questions.')
    );
  }

  // --- ScenarioMCQ requires scenario text ---
  if (this.type === 'ScenarioMCQ' && !this.scenario) {
    return next(new Error('scenario text is required for ScenarioMCQ questions.'));
  }

  // --- MultiSelect requires correctAnswers ---
  if (this.type === 'MultiSelect') {
    if (!this.correctAnswers || this.correctAnswers.length === 0) {
      return next(new Error('correctAnswers array is required for MultiSelect questions.'));
    }
    if (!this.options || this.options.length < 2) {
      return next(new Error('MultiSelect questions must have at least 2 options.'));
    }
  }

  // --- Matching: build shuffled left/right columns ---
  if (this.type === 'Matching') {
    if (!this.matchingPairs || this.matchingPairs.length < 2) {
      return next(new Error('Matching questions must have at least 2 pairs.'));
    }
    this.matchingLeft = shuffle(this.matchingPairs.map((p) => p.left));
    this.matchingRight = shuffle(this.matchingPairs.map((p) => p.right));
  }

  // --- Ordering: build shuffled item list ---
  if (this.type === 'Ordering') {
    if (!this.correctOrder || this.correctOrder.length < 2) {
      return next(new Error('Ordering questions must have at least 2 items.'));
    }
    this.orderItems = shuffle(this.correctOrder);
  }

  // --- DragDropClassification: extract items & category names ---
  if (this.type === 'DragDropClassification') {
    if (!this.categories || typeof this.categories !== 'object') {
      return next(
        new Error('categories object is required for DragDropClassification questions.')
      );
    }
    const catNames = Object.keys(this.categories);
    if (catNames.length < 2) {
      return next(new Error('DragDropClassification must have at least 2 categories.'));
    }
    this.categoryNames = catNames;
    // Flatten all items across categories and shuffle
    const allItems = catNames.reduce((acc, cat) => {
      return acc.concat(this.categories[cat] || []);
    }, []);
    if (allItems.length < 2) {
      return next(new Error('DragDropClassification must have at least 2 items.'));
    }
    this.classificationItems = shuffle(allItems);
  }

  // --- Score must be positive for auto-scored types ---
  if (this.score <= 0 && this.type !== 'ShortAnswer') {
    this.score = 1;
  }

  next();
});

module.exports = mongoose.model('Question', questionSchema);
module.exports.QUESTION_TYPES = QUESTION_TYPES;
