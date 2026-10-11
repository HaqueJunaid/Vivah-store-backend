import express from 'express';
import { createOrder, getMyOrders, getOrderById, getAllOrdersAdmin, updateOrderStatus, deleteOrder } from '../controllers/orderController.js';
import { handleCashfreeWebhook, verifyCashfreePayment } from '../controllers/paymentController.js';
import { protect, admin } from '../middlewares/auth.js';

const router = express.Router();

// Cashfree Webhook endpoint aliases (Server-to-server notifications)
router.post('/webhook', handleCashfreeWebhook);
router.post('/cashfree-webhook', handleCashfreeWebhook);

// Payment verification endpoint
router.post('/verify-payment', protect, verifyCashfreePayment);

router.post('/', protect, createOrder);
router.get('/my-orders', protect, getMyOrders);
router.get('/admin', protect, admin, getAllOrdersAdmin);
router.get('/:id', protect, getOrderById);
router.put('/:id/status', protect, admin, updateOrderStatus);
router.delete('/:id', protect, admin, deleteOrder);

export default router;
