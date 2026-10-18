import express from 'express';
import {
    createCashfreeOrder,
    handleCashfreeWebhook,
    verifyCashfreePayment,
    cancelPaymentOrder,
    getCashfreeConfig,
} from '../controllers/paymentController.js';
import { protect } from '../middlewares/auth.js';

const router = express.Router();

// Cashfree Webhook endpoint (Called by Cashfree servers directly)
// Note: Must NOT require user auth token because it comes server-to-server from Cashfree
router.post('/webhook', handleCashfreeWebhook);

// Also alias /cashfree-webhook
router.post('/cashfree-webhook', handleCashfreeWebhook);

// Configuration endpoint for frontend SDK
router.get('/config', getCashfreeConfig);

// Create order and Cashfree session
router.post('/create-order', protect, createCashfreeOrder);

// Verify and synchronize order status
router.post('/verify', protect, verifyCashfreePayment);

// Cancel uncompleted order when user cancels payment
router.post('/cancel', protect, cancelPaymentOrder);

export default router;
