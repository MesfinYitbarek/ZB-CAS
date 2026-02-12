/* models/Competency.js
 * Competency(CompetencyID, Name, Category, Description, NoOfQuestions)
 *
 * Categories match the doc: Core | Managerial | Leadership | Technical
 * NoOfQuestions is a virtual that counts linked Question documents at
 * query time (avoids stale counters on insert/delete).
 */
import mongoose from 'mongoose';

const CATEGORIES = ['Core', 'Managerial', 'Leadership', 'Technical'];

const competencySchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, 'Competency name is required.'],
      unique:   true,
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
  },
  { timestamps: true, strict: true }
);

// Indexes
competencySchema.index({ category: 1 });

export default mongoose.model('Competency', competencySchema);
