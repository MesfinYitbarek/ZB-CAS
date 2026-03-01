/* models/Assessment.js
 * Assessment(AssessmentID, CompetencyID, TargetGroup, Purpose,
 *            Description, TargetAudience, ReminderDaysBefore,
 *            QuestionID[], StartDate, EndDate, TimeLimit,
 *            Type, Weight{SelfAssessment, Supervisor}, Status)
 *
 * Types:
 *   SelfAssessment   – employee only
 *   SupervisorOnly   – supervisor only
 *   Combined         – both; weights define the blend
 *
 * Status workflow:  DRAFT → SCHEDULED → ACTIVE → COMPLETED → ARCHIVED
 */
import mongoose from 'mongoose';

const ASSESSMENT_TYPES = ['SelfAssessment', 'SupervisorOnly', 'Combined'];
const STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];
const TARGET_GROUPS = ['managerial', 'non-managerial', 'common'];
const PURPOSES = [
  'Career Development',
  'Succession Planning',
  'Performance Improvement',
  'Training Needs Analysis',
  'Promotion Readiness',
  'Other',
];
const AUDIENCE_TYPES = ['ALL_DEPARTMENTS', 'DEPARTMENT_ALL', 'SPECIFIC_EMPLOYEES'];

const assessmentSchema = new mongoose.Schema(
  {
    competencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competency',
      required: [true, 'Competency ID is required.'],
    },

    // ── New fields ────────────────────────────────────────────────────────────
    targetGroup: {
      type: String,
      enum: TARGET_GROUPS,
      required: [true, 'Target group is required.'],
    },

    purpose: {
      type: String,
      enum: PURPOSES,
      required: [true, 'Purpose is required.'],
    },

    reminderDaysBefore: {
      type: Number,
      default: null,
      min: 1,
    },

    reminderSent: {
      type: Boolean,
      default: false,
    },

    // Structured target audience (replaces the simple target.department / position)
    targetAudience: {
      type: {
        type: String,
        enum: AUDIENCE_TYPES,
        default: 'ALL_DEPARTMENTS',
      },
      departments: [{ type: String, trim: true }],
      employeeIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
    },
    // ── End new fields ────────────────────────────────────────────────────────

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },

    // Legacy target kept for backward compatibility
    target: {
      department: { type: String, trim: true, default: null },
      position: { type: String, trim: true, default: null },
    },

    questionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
      },
    ],
    startDate: {
      type: Date,
      required: [true, 'Start date is required.'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required.'],
    },
    timeLimit: {
      type: Number,
      default: null,
      min: 1,
    },
    type: {
      type: String,
      required: [true, 'Assessment type is required.'],
      enum: ASSESSMENT_TYPES,
    },
    weight: {
      selfAssessment: { type: Number, default: 20 },
      supervisor: { type: Number, default: 80 },
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'DRAFT',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    supervisorEvaluations: [{
      employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      supervisorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      status: {
        type: String,
        enum: ['PENDING', 'COMPLETED'],
        default: 'PENDING',
      },
      completedAt: {
        type: Date,
        default: null,
      },
    }],
  },
  { timestamps: true, strict: true }
);

// ─── Indexes ─────────────────────────────────────────────
assessmentSchema.index({ competencyId: 1 });
assessmentSchema.index({ status: 1 });
assessmentSchema.index({ startDate: 1, endDate: 1 });
assessmentSchema.index({ 'target.department': 1 });
assessmentSchema.index({ 'targetAudience.type': 1 });
assessmentSchema.index({ 'targetAudience.departments': 1 });
assessmentSchema.index({ 'targetAudience.employeeIds': 1 });
assessmentSchema.index({ targetGroup: 1 });

// ─── Post-save hook: generate reports for archived assessments ─────────────
assessmentSchema.post('save', async function(doc) {
  if (doc.status === 'ARCHIVED') {
    const { generateReportsForAssessment } = await import('../services/reportService.js');
    await generateReportsForAssessment(doc._id);
  }
});

// ─── Validation: endDate must be after startDate & weights must sum to 100 ─
assessmentSchema.pre('save', function(next) {
  if (this.endDate <= this.startDate) {
    return next(new Error('End date must be after start date.'));
  }
  if (this.type === 'Combined') {
    const sum = (this.weight.selfAssessment || 0) + (this.weight.supervisor || 0);
    if (sum !== 100) {
      return next(new Error('Self-assessment and supervisor weights must sum to 100.'));
    }
  }
  next();
});

export default mongoose.model('Assessment', assessmentSchema);
