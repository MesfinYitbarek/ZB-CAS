/* models/Notification.js */
import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'ASSESSMENT_ASSIGNED',   // employee gets a new assessment
  'RESULT_READY',          // result scored and available
  'SUPERVISOR_REMINDER',   // supervisor needs to evaluate
  'DEADLINE_REMINDER',     // assessment deadline approaching
  'ACCOUNT_CREATED',       // welcome / account created
];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    body: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    // Optional deep-link path (e.g. '/assessments', '/results')
    link: {
      type: String,
      default: null,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    // Optional extra metadata (assessmentId, resultId, etc.)
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

// Fast unread-count queries
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);