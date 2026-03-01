/* models/Feedback.js
 * Feedback management – employees can submit feedback on their assessment experience.
 * ES Module version — review/status concept removed.
 */
import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'User ID is required.'],
    },
    assessmentId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Assessment',
      required: [true, 'Assessment ID is required.'],
    },
    content: {
      type:      String,
      required:  [true, 'Feedback content is required.'],
      trim:      true,
      maxlength: 2000,
    },
    // 1-5 star rating (optional)
    rating: {
      type:    Number,
      min:     1,
      max:     5,
      default: null,
    },
  },
  { timestamps: true, strict: true }
);

// Indexes
feedbackSchema.index({ assessmentId: 1 });
feedbackSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Feedback', feedbackSchema);
