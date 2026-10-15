import { Order } from '../models/Order.js';
import { Cart } from '../models/Cart.js';
import { Address } from '../models/Address.js';
import { Product } from '../models/Product.js';
import mongoose from 'mongoose';
import { deleteFromImageKit } from '../middlewares/upload.js';
import { Setting } from '../models/Setting.js';
import {
    createCashfreeOrderSession,
    fetchCashfreeOrderPayments,
    isCashfreePaymentMatchingOrder,
} from '../config/cashfree.js';
import { config } from '../config/config.js';

export const createOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { addressId, paymentMethod = 'cashfree' } = req.body;

        if (!addressId) {
            return res.status(400).json({
                success: false,
                message: 'Address ID is required.',
            });
        }

        if (paymentMethod !== 'cashfree') {
            return res.status(400).json({
                success: false,
                message: 'Only Cashfree payments are supported.',
            });
        }

        if (!config.cashfree.appId || !config.cashfree.secretKey) {
            return res.status(503).json({
                success: false,
                message: 'Online payments are temporarily unavailable.',
            });
        }

        // Fetch user's cart
        const cart = await Cart.findOne({ userId });
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty.',
            });
        }

        // Fetch shipping address
        const address = await Address.findOne({ _id: addressId, user: userId });
        if (!address) {
            return res.status(400).json({
                success: false,
                message: 'Invalid delivery address.',
            });
        }

        // Validate products and check stock
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
        const totalAmount = subtotal + gstAmount + settings.shippingCost;

        // Create Order
        const isCashfree = paymentMethod === 'cashfree';

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
            paymentMethod,
            paymentStatus: 'Pending',
            status: 'Pending',
        });

        let paymentSessionId = null;
        const cfOrderId = `order_${order._id.toString()}`;

        if (isCashfree) {
            order.cashfreeOrderId = cfOrderId;

            if (config.cashfree.appId && config.cashfree.secretKey) {
                try {
                    const clientOrigin = config.client_origin
                        ? config.client_origin.split(',')[0].trim().replace(/\/$/, '')
                        : 'http://localhost:5173';

                    const customerPhone = (address.phone || req.user.phone || '9999999999').replace(/[^0-9]/g, '').slice(-10) || '9999999999';
                    const customerName = `${address.firstName || ''} ${address.lastName || ''}`.trim() || req.user.name || 'Customer';
                    const customerEmail = req.user.email || 'customer@vivahstore.com';

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
                        order.cashfreePaymentSessionId = paymentSessionId;
                    }
                } catch (cfErr) {
                    console.error('[Cashfree createOrder error]:', cfErr?.response?.data || cfErr.message);
                    // Rollback order so no phantom order remains in MongoDB
                    await Order.findByIdAndDelete(order._id);
                    return res.status(502).json({
                        success: false,
                        message: cfErr?.response?.data?.message || 'Failed to initiate Cashfree payment session. Please verify Cashfree credentials.',
                    });
                }
            } else {
                paymentSessionId = `mock_session_${Date.now()}`;
                order.cashfreePaymentSessionId = paymentSessionId;
            }

            await order.save();
        }

        res.status(201).json({
            success: true,
            message: 'Order placed successfully.',
            order,
            paymentSessionId,
            cashfreeOrderId: cfOrderId,
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to place order.',
        });
    }
};

export const getMyOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const orders = await Order.find({ user: userId })
            .populate('items.product', 'imageUrls title')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            orders,
        });
    } catch (error) {
        console.error('Get my orders error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch your orders.',
        });
    }
};

export const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Order ID format.',
            });
        }

        let order = await Order.findById(id).populate('items.product', 'imageUrls title');
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found.',
            });
        }

        // Ensure user is authorized to view this order
        const orderUserId = order.user?._id ? order.user._id.toString() : order.user?.toString();
        if (req.user.role !== 'admin' && orderUserId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this order.',
            });
        }

        // Auto-reconciliation: If order is still pending for Cashfree payment, check with Cashfree API
        // This solves "payment successful by user but pending in DB due to internet/redirect issue"
        if (
            order.paymentMethod === 'cashfree' &&
            order.paymentStatus === 'Pending' &&
            order.cashfreeOrderId &&
            config.cashfree.appId &&
            config.cashfree.secretKey
        ) {
            try {
                const response = await fetchCashfreeOrderPayments(order.cashfreeOrderId);
                const payments = response?.data || [];
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
                        paymentMessage: successfulPayment.payment_message || 'Payment auto-reconciled on order lookup',
                        verifiedAt: new Date(),
                    };
                    await order.save();
                    console.log(`[Order Auto-Reconciled] Order ${order._id} was marked Completed via getOrderById`);

                    // Clear cart
                    await Cart.findOneAndUpdate({ userId: order.user }, { $set: { items: [] } });
                }
            } catch (reconErr) {
                console.error('[Order Reconciliation Error]:', reconErr?.response?.data || reconErr.message);
            }
        }

        res.status(200).json({
            success: true,
            order,
        });
    } catch (error) {
        console.error('Get order by ID error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch order details.',
        });
    }
};

export const getAllOrdersAdmin = async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page, 10) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
        const search = req.query.search || '';

        let query = {};
        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            const orConditions = [
                { 'shippingAddress.firstName': searchRegex },
                { 'shippingAddress.lastName': searchRegex },
                { 'status': searchRegex },
                { 'items.name': searchRegex }
            ];

            if (mongoose.Types.ObjectId.isValid(search)) {
                orConditions.push({ _id: search });
            }

            query.$or = orConditions;
        }

        const skip = (page - 1) * limit;
        const orders = await Order.find(query)
            .populate('items.product', 'imageUrls title')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Order.countDocuments(query);

        // Compute total revenue of all orders in system using aggregate (database-level calculation)
        const [revenueAgg] = await Order.aggregate([
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        const totalRevenue = revenueAgg ? revenueAgg.total : 0;

        res.status(200).json({
            success: true,
            orders,
            total,
            page,
            limit,
            totalRevenue,
        });
    } catch (error) {
        console.error('Admin get all orders error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch orders.',
        });
    }
};

export const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order status.',
            });
        }

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found.',
            });
        }

        order.status = status;
        // If status is marked as Delivered, we can optionally mark payment as completed for COD orders
        if (status === 'Delivered' && order.paymentMethod === 'cod') {
            order.paymentStatus = 'Completed';
        }
        
        await order.save();

        res.status(200).json({
            success: true,
            message: 'Order status updated successfully.',
            order,
        });
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update order status.',
        });
    }
};

export const deleteOrder = async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found.',
            });
        }

        const allowedStatuses = ['Delivered', 'Cancelled'];
        if (!allowedStatuses.includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: 'Only fulfilled (Delivered) or Cancelled orders can be deleted.',
            });
        }

        // Delete uploaded images from ImageKit
        const imageUrls = order.items
            .map(item => item.uploadedImage)
            .filter(url => typeof url === 'string' && url.length > 0);

        if (imageUrls.length > 0) {
            try {
                await deleteFromImageKit(imageUrls);
            } catch (imgError) {
                console.error('Failed to delete some images from ImageKit:', imgError);
            }
        }

        // Delete the order from MongoDB
        await Order.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Order and its associated files deleted successfully.',
        });
    } catch (error) {
        console.error('Delete order error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete order.',
        });
    }
};

