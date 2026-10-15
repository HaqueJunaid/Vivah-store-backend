import { Cashfree, CFEnvironment } from 'cashfree-pg';
import crypto from 'crypto';
import { config } from './config.js';

const isProduction = (config.cashfree.env || '').toUpperCase() === 'PRODUCTION';
const environment = isProduction ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;

export const cashfreeClient = new Cashfree(
    environment,
    config.cashfree.appId || '',
    config.cashfree.secretKey || ''
);

cashfreeClient.XApiVersion = config.cashfree.apiVersion || '2023-08-01';

console.log(`[Cashfree] Initialized with environment: ${isProduction ? 'PRODUCTION' : 'SANDBOX'}`);

/**
 * Create order with Cashfree Payment Gateway
 */
export const createCashfreeOrderSession = async (orderData) => {
    // If credentials are the same (user pasted App ID into Secret Key) or missing, throw helpful error
    if (config.cashfree.appId && config.cashfree.appId === config.cashfree.secretKey) {
        throw new Error('Authentication Error: CASHFREE_SECRET_KEY in backend/.env is identical to CASHFREE_APP_ID. In Cashfree, the Secret Key is a separate key generated from Developers -> API Keys.');
    }

    return await cashfreeClient.PGCreateOrder(orderData);
};

/**
 * Fetch payments for an order from Cashfree
 */
export const fetchCashfreeOrderPayments = async (orderId) => {
    return await cashfreeClient.PGOrderFetchPayments(orderId);
};

/**
 * Fetch order status from Cashfree
 */
export const fetchCashfreeOrderStatus = async (orderId) => {
    return await cashfreeClient.PGFetchOrder(orderId);
};

export const isCashfreePaymentMatchingOrder = (payment, totalAmount) => {
    const paymentAmount = Number(payment?.payment_amount);
    return Number.isFinite(paymentAmount) &&
        Math.round(paymentAmount * 100) === Math.round(totalAmount * 100) &&
        payment?.payment_currency === 'INR';
};

/**
 * Verify Cashfree Webhook Signature
 * Cashfree computes HMAC SHA256 of: timestamp + rawBody using the secret key.
 */
export const verifyCashfreeWebhookSignature = (signature, rawBody, timestamp) => {
    try {
        if (!signature || !timestamp || !rawBody) {
            console.warn('[Cashfree Webhook] Missing signature, timestamp, or raw body.');
            return false;
        }

        const secretKey = config.cashfree.secretKey;
        if (!secretKey) {
            console.warn('[Cashfree Webhook] CASHFREE_SECRET_KEY is not configured in backend .env.');
            return false;
        }

        // 1. Try SDK built-in verification if available
        try {
            if (typeof cashfreeClient.PGVerifyWebhookSignature === 'function') {
                const verified = cashfreeClient.PGVerifyWebhookSignature(signature, rawBody, timestamp);
                if (verified) return true;
            }
        } catch (sdkErr) {
            // Continue to HMAC check
        }

        // 2. Manual HMAC-SHA256 comparison for complete reliability
        const payloadToSign = `${timestamp}${rawBody}`;
        const generatedSignature = crypto
            .createHmac('sha256', secretKey)
            .update(payloadToSign)
            .digest('base64');

        const sigBuf = Buffer.from(signature);
        const genBuf = Buffer.from(generatedSignature);

        if (sigBuf.length !== genBuf.length) {
            return false;
        }

        return crypto.timingSafeEqual(sigBuf, genBuf);
    } catch (error) {
        console.error('[Cashfree Webhook] Signature verification error:', error);
        return false;
    }
};

export { Cashfree, CFEnvironment };
