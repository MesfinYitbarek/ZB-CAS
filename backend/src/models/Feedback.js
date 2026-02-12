/* models/Feedback.js
 * Feedback management – employees can submit feedback on their assessment
 * experience. HR admins can view and mark feedback as reviewed.
 * ES Module version
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
      type:     String,
      required: [true, 'Feedback content is required.'],
      trim:     true,
      maxlength: 2000,
    },
    // 1-5 star rating (optional)
    rating: {
      type: Number,
      min:  1,
      max:  5,
      default: null,
    },
    reviewed: {
      type:    Boolean,
      default: false,
    },
    reviewedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
    reviewedAt: {
      type:    Date,
      default: null,
    },
  },
  { timestamps: true, strict: true }
);

// Indexes
feedbackSchema.index({ assessmentId: 1 });
feedbackSchema.index({ userId: 1, createdAt: -1 });
feedbackSchema.index({ reviewed: 1 });

export default mongoose.model('Feedback', feedbackSchema);
