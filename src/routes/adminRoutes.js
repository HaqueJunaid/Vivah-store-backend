import express from 'express';
import { getDashboardStats, getInsightsData, getSettings, updateSettings } from '../controllers/adminController.js';
import { protect, admin } from '../middlewares/auth.js';

const router = express.Router();

router.get('/dashboard-stats', protect, admin, getDashboardStats);
router.get('/insights', protect, admin, getInsightsData);
router.get('/settings', protect, admin, getSettings);
router.put('/settings', protect, admin, updateSettings);

export default router;
