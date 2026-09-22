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

export const Category = mongoose.model('Category', categorySchema);
