import express from 'express';
import { Setting } from '../models/Setting.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        let settings = await Setting.findOne();
        if (!settings) {
            settings = await Setting.create({ gstRate: 18, shippingCost: 50 });
        }
        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error fetching public settings:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch settings' });
    }
});

export default router;
