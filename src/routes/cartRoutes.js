import express from 'express';
import { getCart, syncCart, clearCart } from '../controllers/cartController.js';
import { protect } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', protect, getCart);
router.post('/sync', protect, syncCart);
router.delete('/', protect, clearCart);

export default router;
