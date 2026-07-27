import { Order } from '../models/Order.js';
import { Cart } from '../models/Cart.js';
import { Address } from '../models/Address.js';
import { Product } from '../models/Product.js';
import mongoose from 'mongoose';
import { deleteFromImageKit } from '../middlewares/upload.js';
import { Setting } from '../models/Setting.js';

export const createOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { addressId, paymentMethod = 'mock' } = req.body;

        if (!addressId) {
            return res.status(400).json({
                success: false,
                message: 'Address ID is required.',
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

        for (const item of cart.items) {
            const product = await Product.findById(item.productId);
            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: `Product not found: ${item.productName}`,
                });
            }

            if (product.quantity < item.productQuantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for product: ${product.title}. Available: ${product.quantity}`,
                });
            }

            orderItems.push({
                product: product._id,
                name: product.title,
                price: product.price,
                quantity: item.productQuantity,
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

        // Deduct stock quantities from database
        for (const item of cart.items) {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { quantity: -item.productQuantity }
            });
        }

        // Create Order
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
            paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Completed',
            status: 'Pending',
        });

        // Clear user cart
        cart.items = [];
        await cart.save();

        res.status(201).json({
            success: true,
            message: 'Order placed successfully.',
            order,
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
        const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });

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

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found.',
            });
        }

        // Ensure user is authorized to view this order
        if (req.user.role !== 'admin' && order.user.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this order.',
            });
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
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Order.countDocuments(query);

        // Compute total revenue of all orders in system (not just current page)
        const allOrders = await Order.find({}, 'totalAmount');
        const totalRevenue = allOrders.reduce((sum, ord) => sum + ord.totalAmount, 0);

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

