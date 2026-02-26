import mongoose from 'mongoose';

const CATEGORIES = [
  'Core-Personal effectiveness',
  'Core-Behavioral',
  'Managerial',
  'Leadership',
  'Technical'
];

const TARGET_GROUPS = ['managerial', 'non-managerial', 'common'];

const targetGroupEntrySchema = new mongoose.Schema({
  targetGroup: {
    type: String,
    required: true,
    enum: TARGET_GROUPS,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
}, { _id: false });

const competencySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Competency name is required.'],
      trim: true,
      maxlength: 150,
    },
    category: {
      type: String,
      required: [true, 'Category is required.'],
      enum: CATEGORIES,
    },
    targetGroups: {
      type: [targetGroupEntrySchema],
      required: [true, 'At least one target group is required.'],
      minlength: [1, 'At least one target group is required.'],
    },
  },
  { timestamps: true, strict: true }
);

// Prevent duplicate competency name in the same category
competencySchema.index({ name: 1, category: 1 }, { unique: true });
competencySchema.index({ category: 1 });
competencySchema.index({ 'targetGroups.targetGroup': 1 });

export default mongoose.model('Competency', competencySchema);