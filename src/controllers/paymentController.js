import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { Cart } from '../models/Cart.js';
import { Address } from '../models/Address.js';
import { Product } from '../models/Product.js';
import { Setting } from '../models/Setting.js';
import {
    createCashfreeOrderSession,
    fetchCashfreeOrderPayments,
    isCashfreePaymentMatchingOrder,
    verifyCashfreeWebhookSignature,
} from '../config/cashfree.js';
import { config } from '../config/config.js';

/**
 * Create a new Cashfree checkout order
 */
export const createCashfreeOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { addressId } = req.body;

        if (!config.cashfree.appId || !config.cashfree.secretKey) {
            return res.status(503).json({
                success: false,
                message: 'Online payments are temporarily unavailable.',
            });
        }

        if (!addressId) {
            return res.status(400).json({
                success: false,
                message: 'Delivery address ID is required.',
            });
        }

        // Fetch user's cart
        const cart = await Cart.findOne({ userId });
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty.',
            });
        }

        // Fetch shipping address
        const address = await Address.findOne({ _id: addressId, user: userId });
        if (!address) {
            return res.status(400).json({
                success: false,
                message: 'Invalid delivery address selected.',
            });
        }

        // Validate products and inventory
        const orderItems = [];
        let subtotal = 0;
        const products = await Product.find({ _id: { $in: cart.items.map((item) => item.productId) } }).lean();
        const productsById = new Map(products.map((product) => [product._id.toString(), product]));

        for (const item of cart.items) {
            if (!Number.isSafeInteger(item.productQuantity) || item.productQuantity < 1 || item.productQuantity > 10000) {
                return res.status(400).json({
                    success: false,
                    message: 'Cart contains an invalid product quantity.',
                });
            }

            const product = productsById.get(item.productId.toString());
            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: `Product not found: ${item.productName}`,
                });
            }

            const isProductInStock = product.inStock !== false && (product.inStock !== undefined || product.quantity > 0);
            if (!isProductInStock) {
                return res.status(400).json({
                    success: false,
                    message: `Product is currently out of stock: ${product.title}`,
                });
            }

            const variantImage = (item.selectedVariant && typeof item.selectedVariant === 'object' && item.selectedVariant.images?.[0]) || '';
            const prodImage = item.productImage || variantImage || (product.imageUrls && product.imageUrls[0]) || '';

            orderItems.push({
                product: product._id,
                name: product.title,
                price: product.price,
                quantity: item.productQuantity,
                productImage: prodImage,
                selectedVariant: item.selectedVariant,
                customizations: item.customizations,
                uploadedImage: item.uploadedImage || '',
            });

            subtotal += product.price * item.productQuantity;
        }

        // Fetch settings for gst and shipping
        let settings = await Setting.findOne();
        if (!settings) {
            settings = { gstRate: 18, shippingCost: 50 };
        }

        const gstAmount = subtotal * (settings.gstRate / 100);
        const totalAmount = Math.round((subtotal + gstAmount + settings.shippingCost) * 100) / 100;

        // Create Order in DB first with Pending status
        const order = await Order.create({
            user: userId,
            items: orderItems,
            shippingAddress: {
                firstName: address.firstName,
                lastName: address.lastName,
                company: address.company || '',
                country: address.country,
                address: address.address,
                apartment: address.apartment || '',
                city: address.city,
                postalCode: address.postalCode,
                phone: address.phone,
            },
            subtotal,
            gstAmount,
            shippingCost: settings.shippingCost,
            totalAmount,
            paymentMethod: 'cashfree',
            paymentStatus: 'Pending',
            status: 'Pending',
        });

        // Prepare Cashfree order ID
        const cfOrderId = `order_${order._id.toString()}`;
        const customerPhone = (address.phone || req.user.phone || '9999999999').replace(/[^0-9]/g, '').slice(-10) || '9999999999';
        const customerName = `${address.firstName || ''} ${address.lastName || ''}`.trim() || req.user.name || 'Customer';
        const customerEmail = req.user.email || 'customer@vivahstore.com';

        let paymentSessionId = null;

        {
            try {
                const clientOrigin = config.client_origin
                    ? config.client_origin.split(',')[0].trim().replace(/\/$/, '')
                    : 'http://localhost:5173';

                const createOrderRequest = {
                    order_amount: totalAmount,
                    order_currency: 'INR',
                    order_id: cfOrderId,
                    customer_details: {
                        customer_id: userId.toString(),
                        customer_name: customerName,
                        customer_email: customerEmail,
                        customer_phone: customerPhone,
                    },
                    order_meta: {
                        return_url: `${clientOrigin}/orders/${order._id}?order_id={order_id}`,
                        notify_url: `${(config.api_origin || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/api/payment/webhook`,
                    },
                    order_note: `VivahStore Order #${order._id}`,
                };

                const response = await createCashfreeOrderSession(createOrderRequest);
                if (response?.data?.payment_session_id) {
                    paymentSessionId = response.data.payment_session_id;
                    order.cashfreeOrderId = cfOrderId;
                    order.cashfreePaymentSessionId = paymentSessionId;
                    await order.save();
                } else {
                    console.warn('[Cashfree PGCreateOrder] No payment_session_id returned:', response?.data);
                }
            } catch (cfError) {
                console.error('[Cashfree PGCreateOrder Error]:', cfError?.response?.data || cfError.message);
                // Rollback and remove the uninitiated order from MongoDB so no phantom "Pending" order is created
                await Order.findByIdAndDelete(order._id);

                let friendlyMessage = 'Failed to initiate Cashfree payment session. Please check your Cashfree credentials.';
                if (config.cashfree.appId && config.cashfree.appId === config.cashfree.secretKey) {
                    friendlyMessage = 'Invalid Cashfree Config: CASHFREE_SECRET_KEY in backend/.env is identical to CASHFREE_APP_ID. Please paste your actual Secret Key from the Cashfree Dashboard (Developers -> API Keys).';
                } else if (cfError?.response?.status === 401) {
                    friendlyMessage = 'Cashfree Authentication Failed (401). Please verify your CASHFREE_APP_ID and CASHFREE_SECRET_KEY in backend/.env.';
                } else if (cfError?.response?.data?.message) {
                    friendlyMessage = cfError.response.data.message;
                } else if (cfError?.message) {
                    friendlyMessage = cfError.message;
                }

                return res.status(502).json({
                    success: false,
                    message: friendlyMessage,
                    error: cfError?.response?.data || cfError.message,
                });
            }
        }

        res.status(201).json({
            success: true,
            message: 'Cashfree order created successfully.',
            order,
            paymentSessionId,
            cashfreeOrderId: cfOrderId,
            mode: (config.cashfree.env || 'SANDBOX').toLowerCase(),
        });
    } catch (error) {
        console.error('Create Cashfree order error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to initiate order checkout.',
        });
    }
};

/**
 * Cashfree Webhook Handler
 * 
 * CRITICAL FIX FOR:
 * "payment sucessfully by user but for some internet or other issue in order status it showing pending"
 * 
 * Cashfree calls this asynchronous server-to-server webhook on payment events (PAYMENT_SUCCESS_WEBHOOK, ORDER_PAID, etc.).
 * Because this occurs directly between Cashfree and our server, the order status will ALWAYS be updated
 * to 'Completed' even if:
 * 1. The user's internet dropped right after entering UPI PIN.
 * 2. The user closed the browser tab or app before redirecting back.
 * 3. The user encountered browser crashes, redirects timeouts, or mobile app switches.
 */
export const handleCashfreeWebhook = async (req, res) => {
    try {
        const signature = req.headers['x-webhook-signature'] || req.headers['X-Webhook-Signature'];
        const timestamp = req.headers['x-webhook-timestamp'] || req.headers['X-Webhook-Timestamp'];
        const rawBody = req.rawBody || JSON.stringify(req.body);

        console.log(`[Cashfree Webhook Received] Timestamp: ${timestamp}, Event: ${req.body?.type}`);

        // Verify Cashfree Webhook signature
        const isValid = verifyCashfreeWebhookSignature(signature, rawBody, timestamp);
        if (!isValid) {
            console.error('[Cashfree Webhook] Invalid webhook signature detected!');
            return res.status(400).json({
                success: false,
                message: 'Invalid webhook signature',
            });
        }

        const payload = req.body || {};
        const eventType = payload.type || payload.event || '';
        const eventData = payload.data || {};

        // Extract order_id and payment object
        const cfOrderId = eventData.order?.order_id || eventData.order_id || payload.order_id;
        const payment = eventData.payment || {};
        const paymentStatus = (payment.payment_status || '').toUpperCase();

        if (!cfOrderId) {
            console.warn('[Cashfree Webhook] Webhook payload missing order_id:', payload);
            return res.status(200).json({ status: 'IGNORED_NO_ORDER_ID' });
        }

        console.log(`[Cashfree Webhook] Processing event '${eventType}' for Cashfree Order ID: ${cfOrderId}, Payment Status: ${paymentStatus}`);

        // Find the matching Order in MongoDB
        let order = await Order.findOne({ cashfreeOrderId: cfOrderId });

        if (!order) {
            // If order was stored with or without 'order_' prefix
            const strippedId = cfOrderId.startsWith('order_') ? cfOrderId.replace('order_', '') : cfOrderId;
            if (mongoose.Types.ObjectId.isValid(strippedId)) {
                order = await Order.findById(strippedId);
            }
        }

        if (!order) {
            console.warn(`[Cashfree Webhook] No matching order found in database for ID: ${cfOrderId}`);
            // Return 200 so Cashfree does not endlessly retry for non-existent orders
            return res.status(200).json({ status: 'ORDER_NOT_FOUND' });
        }

        const isSuccess =
            eventType === 'PAYMENT_SUCCESS_WEBHOOK' ||
            eventType === 'ORDER_PAID' ||
            paymentStatus === 'SUCCESS';

        const isFailed =
            eventType === 'PAYMENT_FAILED_WEBHOOK' ||
            paymentStatus === 'FAILED' ||
            paymentStatus === 'CANCELLED';

        const isUserDropped =
            eventType === 'PAYMENT_USER_DROPPED_WEBHOOK' ||
            paymentStatus === 'USER_DROPPED';

        if (isSuccess) {
            const paymentForValidation = {
                ...payment,
                payment_amount: payment.payment_amount ?? eventData.order?.order_amount,
                payment_currency: payment.payment_currency ?? eventData.order?.order_currency,
            };
            if (!isCashfreePaymentMatchingOrder(paymentForValidation, order.totalAmount)) {
                console.error(`[Cashfree Webhook] Payment amount or currency mismatch for order ${order._id}.`);
                return res.status(400).json({
                    success: false,
                    message: 'Payment amount or currency does not match the order.',
                });
            }

            // Idempotent check: if already completed, don't perform duplicate actions
            if (order.paymentStatus === 'Completed') {
                console.log(`[Cashfree Webhook] Order ${order._id} was already marked as Completed. No duplicate update needed.`);
                return res.status(200).json({ status: 'ALREADY_COMPLETED' });
            }

            // Update order payment status and processing status
            order.paymentStatus = 'Completed';
            if (order.status === 'Pending') {
                order.status = 'Processing';
            }

            order.paymentDetails = {
                cfPaymentId: payment.cf_payment_id || null,
                paymentMethod: payment.payment_group || 'cashfree',
                paymentTime: payment.payment_time ? new Date(payment.payment_time) : new Date(),
                bankReference: payment.bank_reference || null,
                paymentCurrency: payment.payment_currency || 'INR',
                paymentAmount: payment.payment_amount || order.totalAmount,
                paymentMessage: payment.payment_message || 'Payment successful via Cashfree webhook',
                webhookProcessedAt: new Date(),
            };

            await order.save();
            console.log(`[Cashfree Webhook SUCCESS] Successfully updated Order #${order._id} to Completed/Processing.`);

            // Clear user's cart in the database
            try {
                await Cart.findOneAndUpdate({ userId: order.user }, { $set: { items: [] } });
                console.log(`[Cashfree Webhook] Cleared cart for user: ${order.user}`);
            } catch (cartErr) {
                console.error('[Cashfree Webhook] Error clearing cart:', cartErr);
            }

            return res.status(200).json({
                status: 'SUCCESS',
                message: 'Order updated to Completed',
                orderId: order._id,
            });
        }

        if (isFailed) {
            if (order.paymentStatus === 'Pending') {
                order.paymentStatus = 'Failed';
                order.paymentDetails = {
                    cfPaymentId: payment.cf_payment_id || null,
                    paymentMessage: payment.payment_message || 'Payment Failed',
                    webhookProcessedAt: new Date(),
                };
                await order.save();
                console.log(`[Cashfree Webhook FAILED] Marked Order #${order._id} payment as Failed.`);
            }
            return res.status(200).json({ status: 'FAILED_RECORDED' });
        }

        if (isUserDropped) {
            console.log(`[Cashfree Webhook] User dropped payment for Order #${order._id}`);
            return res.status(200).json({ status: 'USER_DROPPED_RECORDED' });
        }

        return res.status(200).json({ status: 'RECEIVED' });
    } catch (error) {
        console.error('[Cashfree Webhook Error]:', error);
        // Return 500 so Cashfree will retry if there's a temporary database downtime
        return res.status(500).json({
            success: false,
            message: 'Webhook processing error',
        });
    }
};

/**
 * Verify and Reconcile Payment Status
 * 
 * Used:
 * 1. When user returns from checkout redirect or modal.
 * 2. On-demand if order is still showing Pending due to network delays.
 */
export const verifyCashfreePayment = async (req, res) => {
    try {
        const { orderId } = req.body;
        const currentUserId = req.user.id;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required.',
            });
        }

        let order = null;
        if (mongoose.Types.ObjectId.isValid(orderId)) {
            order = await Order.findById(orderId);
        } else {
            order = await Order.findOne({ cashfreeOrderId: orderId });
        }

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found.',
            });
        }

        // Check ownership or admin
        const orderUserId = order.user?._id ? order.user._id.toString() : order.user?.toString();
        if (req.user.role !== 'admin' && orderUserId !== currentUserId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to verify this order.',
            });
        }

        // If order is already completed
        if (order.paymentStatus === 'Completed') {
            return res.status(200).json({
                success: true,
                paymentStatus: 'Completed',
                orderStatus: order.status,
                order,
                message: 'Payment is already confirmed.',
            });
        }

        // If Cashfree order ID is present, fetch payments from Cashfree directly
        const cfOrderId = order.cashfreeOrderId || `order_${order._id.toString()}`;

        if (config.cashfree.appId && config.cashfree.secretKey) {
            try {
                const response = await fetchCashfreeOrderPayments(cfOrderId);
                const payments = response?.data || [];

                console.log(`[Verify Payment] Fetched ${payments.length} payment(s) from Cashfree for ${cfOrderId}`);

                // Check if any payment was SUCCESS
                const successfulPayment = Array.isArray(payments)
                    ? payments.find((payment) =>
                        (payment.payment_status || '').toUpperCase() === 'SUCCESS' &&
                        isCashfreePaymentMatchingOrder(payment, order.totalAmount)
                    )
                    : null;

                if (successfulPayment) {
                    order.paymentStatus = 'Completed';
                    if (order.status === 'Pending') {
                        order.status = 'Processing';
                    }
                    order.paymentDetails = {
                        cfPaymentId: successfulPayment.cf_payment_id,
                        paymentMethod: successfulPayment.payment_group || 'cashfree',
                        paymentTime: successfulPayment.payment_time ? new Date(successfulPayment.payment_time) : new Date(),
                        bankReference: successfulPayment.bank_reference || null,
                        paymentAmount: successfulPayment.payment_amount,
                        paymentMessage: successfulPayment.payment_message || 'Payment verified via Cashfree API',
                        verifiedAt: new Date(),
                    };

                    await order.save();

                    // Clear cart
                    await Cart.findOneAndUpdate({ userId: order.user }, { $set: { items: [] } });

                    return res.status(200).json({
                        success: true,
                        paymentStatus: 'Completed',
                        orderStatus: order.status,
                        order,
                        message: 'Payment verified and order confirmed successfully!',
                    });
                }

                // Check if any payment failed
                const failedPayment = Array.isArray(payments)
                    ? payments.find((p) => (p.payment_status || '').toUpperCase() === 'FAILED')
                    : null;

                if (failedPayment) {
                    order.paymentStatus = 'Failed';
                    order.paymentDetails = {
                        cfPaymentId: failedPayment.cf_payment_id,
                        paymentMessage: failedPayment.payment_message || 'Payment Failed',
                    };
                    await order.save();

                    return res.status(200).json({
                        success: false,
                        paymentStatus: 'Failed',
                        orderStatus: order.status,
                        order,
                        message: failedPayment.payment_message || 'Payment failed.',
                    });
                }
            } catch (cfApiError) {
                console.error('[Verify Payment Cashfree API Error]:', cfApiError?.response?.data || cfApiError.message);
            }
        }

        return res.status(200).json({
            success: true,
            paymentStatus: order.paymentStatus,
            orderStatus: order.status,
            order,
            message: `Order status is currently ${order.paymentStatus}.`,
        });
    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to verify payment status.',
        });
    }
};

/**
 * Get Cashfree Client Configuration (for Frontend SDK initialization)
 */
export const getCashfreeConfig = (req, res) => {
    res.status(200).json({
        success: true,
        env: (config.cashfree.env || 'SANDBOX').toLowerCase(),
        isConfigured: Boolean(config.cashfree.appId && config.cashfree.secretKey),
    });
};
