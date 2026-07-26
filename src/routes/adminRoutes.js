import express from 'express';
import { getDashboardStats } from '../controllers/adminController.js';
import { protect, admin } from '../middlewares/auth.js';

const router = express.Router();

router.get('/dashboard-stats', protect, admin, getDashboardStats);

export default router;
