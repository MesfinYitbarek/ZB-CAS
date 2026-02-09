/* models/Assessment.js
 * Assessment(AssessmentID, CompetencyID, Description,
 *            Target{Department, Position}, QuestionID[],
 *            StartDate, EndDate, TimeLimit,
 *            Type, Weight{SelfAssessment, Supervisor}, Status)
 *
 * Types:
 *   SelfAssessment   – employee only
 *   SupervisorOnly   – supervisor only
 *   Combined         – both; weights define the blend
 *
 * Status workflow:  DRAFT → SCHEDULED → ACTIVE → COMPLETED → ARCHIVED
 */
const mongoose = require('mongoose');

const ASSESSMENT_TYPES = ['SelfAssessment', 'SupervisorOnly', 'Combined'];
const STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];

const assessmentSchema = new mongoose.Schema(
  {
    competencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competency',
      required: [true, 'Competency ID is required.'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    // Who this assessment targets
    target: {
      department: { type: String, trim: true, default: null },
      position: { type: String, trim: true, default: null },
    },
    // Questions included in this assessment
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
    // Time limit in minutes (null = no limit)
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
    // Only meaningful when type === 'Combined'
    weight: {
      selfAssessment: { type: Number, default: 20 },
      supervisor: { type: Number, default: 80 },
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'DRAFT',
    },
    
    // Who created / manages this assessment
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Add to assessmentSchema after the createdBy field
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

assessmentSchema.index({ competencyId: 1 });
assessmentSchema.index({ status: 1 });
assessmentSchema.index({ startDate: 1, endDate: 1 });
assessmentSchema.index({ 'target.department': 1 });


assessmentSchema.post('save', async function(doc) {

  if (doc.status === 'ARCHIVED') {

    const { generateReportsForAssessment } =
      require('../services/reportService');

    await generateReportsForAssessment(doc._id);

  }

});
// ─── Validation: endDate must be after startDate ─────────────────────────────
assessmentSchema.pre('save', function (next) {
  if (this.endDate <= this.startDate) {
    return next(new Error('End date must be after start date.'));
  }
  // Weights must sum to 100 for Combined
  if (this.type === 'Combined') {
    const sum = (this.weight.selfAssessment || 0) + (this.weight.supervisor || 0);
    if (sum !== 100) {
      return next(new Error('Self-assessment and supervisor weights must sum to 100.'));
    }
  }
  next();
});

module.exports = mongoose.model('Assessment', assessmentSchema);
