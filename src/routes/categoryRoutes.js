import express from 'express';
import {
  getAllCategories,
  addSubCategory,
  createCategory,
  deleteSubCategory,
} from '../controllers/categoryController.js';
import { protect, admin } from '../middlewares/auth.js';

const router = express.Router();

// Public: Get all categories and their subcategories
router.get('/', getAllCategories);

// Admin-only (or authenticated): Add subcategory
router.post('/sub-category', protect, admin, addSubCategory);

// Admin-only: Create main category
router.post('/', protect, admin, createCategory);

// Admin-only: Delete subcategory
router.delete('/sub-category', protect, admin, deleteSubCategory);

export default router;
