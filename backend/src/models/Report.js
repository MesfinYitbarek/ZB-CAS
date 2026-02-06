/* models/Report.js
 * Report(ReportID, User{Name, Department, Position}, CompetencyName,
 *        FinalScore, Level, Recommendation)
 *
 * Per the doc: "the purpose is for reporting and for assessment history
 * management … in case if the UserId delete or change"
 *
 * This is an immutable snapshot created whenever a Result is finalised.
 * It duplicates the user's name/dept/position and the competency name so
 * that historical reports remain accurate even if master data changes.
 */
const mongoose = require('mongoose');

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

const reportSchema = new mongoose.Schema(
  {
    // Snapshot of user info at report-generation time
    user: {
      userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name:       { type: String, required: true },
      department: { type: String, default: '' },
      position:   { type: String, default: '' },
      email:      { type: String, default: '' },
    },
    // Snapshot of competency info
    competencyName: {
      type:     String,
      required: [true, 'Competency name is required.'],
    },
    competencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'Competency',
    },
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'Assessment',
    },
    finalScore: {
      type:     Number,
      required: [true, 'Final score is required.'],
      min:      0,
      max:      100,
    },
    level: {
      type:     String,
      required: [true, 'Level is required.'],
      enum:     LEVELS,
    },
    recommendation: {
      type:    String,
      default: '',
    },
    // When the report was generated (separate from Mongoose timestamps for clarity)
    generatedAt: {
      type:    Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    strict: true,
    // Reports should never be modified after creation
    // (enforced at the application layer – no update routes)
  }
);

reportSchema.index({ 'user.userId': 1 });
reportSchema.index({ assessmentId: 1 });
reportSchema.index({ 'user.department': 1, generatedAt: -1 });
reportSchema.index({ competencyId: 1, generatedAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
