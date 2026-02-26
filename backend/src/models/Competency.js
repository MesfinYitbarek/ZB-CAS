/* models/Competency.js
 * Competency(CompetencyID, Name, Category, Description, NoOfQuestions, TargetGroup)
 *
 * Categories match the doc: Core | Managerial | Leadership | Technical
 * TargetGroup: managerial | non-managerial | common
 * NoOfQuestions is a virtual that counts linked Question documents at
 * query time (avoids stale counters on insert/delete).
 */
import mongoose from 'mongoose';

const CATEGORIES = ['Core-Personal effectiveness','Core-Behavioral', 'Managerial', 'Leadership', 'Technical'];
const TARGET_GROUPS = ['managerial', 'non-managerial', 'common'];

const competencySchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, 'Competency name is required.'],
      trim:     true,
      maxlength: 150,
    },
    category: {
      type:     String,
      required: [true, 'Category is required.'],
      enum:     CATEGORIES,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    targetGroup: {
      type:     String,
      required: [true, 'Target group is required.'],
      enum:     TARGET_GROUPS,
      default: 'common',
    },
  },
  { timestamps: true, strict: true }
);

// Indexes
competencySchema.index({ category: 1 });
competencySchema.index({ targetGroup: 1 });

export default mongoose.model('Competency', competencySchema);