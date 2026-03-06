/* models/FAQ.js */
import mongoose from 'mongoose';

const faqSchema = new mongoose.Schema({
  question: {
    type: String,
    required: [true, 'Question is required'],
    trim: true,
  },
  answer: {
    type: String,
    required: [true, 'Answer is required'],
    trim: true,
  },
  category: {
    type: String,
    enum: ['GENERAL', 'ASSESSMENT', 'ACCOUNT', 'TECHNICAL', 'OTHER'],
    default: 'GENERAL',
  },
  order: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Index for active FAQs ordered by category and order
faqSchema.index({ isActive: 1, category: 1, order: 1 });

const FAQ = mongoose.model('FAQ', faqSchema);
export default FAQ;
