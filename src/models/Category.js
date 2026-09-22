import mongoose from 'mongoose';

const baseItemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  url: {
    type: String,
    required: true,
    trim: true,
  },
}, { _id: false });

const categorySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  url: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  order: {
    type: Number,
    default: 0,
  },
  baseItems: {
    type: [baseItemSchema],
    default: [],
  },
}, {
  timestamps: true,
});

// Case-insensitive title and url indices
categorySchema.index({ url: 1 });
categorySchema.index({ title: 1 });

export const Category = mongoose.model('Category', categorySchema);
