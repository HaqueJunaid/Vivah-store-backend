import { Cart } from '../models/Cart.js';
import mongoose from 'mongoose';

export const getCart = async (req, res) => {
    try {
        const userId = req.user.id;
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(200).json({
                success: true,
                items: [],
            });
        }
        res.status(200).json({
            success: true,
            items: cart.items,
        });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch cart.',
        });
    }
};

export const syncCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const { items } = req.body;

        if (!Array.isArray(items)) {
            return res.status(400).json({
                success: false,
                message: 'Items must be an array.',
            });
        }

        if (items.length > 100 || items.some((item) =>
            !item ||
            !mongoose.Types.ObjectId.isValid(item.productId) ||
            !Number.isSafeInteger(item.productQuantity) ||
            item.productQuantity < 1 ||
            item.productQuantity > 10000
        )) {
            return res.status(400).json({
                success: false,
                message: 'Cart contains invalid products or quantities.',
            });
        }

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items });
        } else {
            cart.items = items;
            cart.updatedAt = Date.now();
        }

        await cart.save();

        res.status(200).json({
            success: true,
            message: 'Cart synced successfully.',
            items: cart.items,
        });
    } catch (error) {
        console.error('Sync cart error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to sync cart.',
        });
    }
};

export const clearCart = async (req, res) => {
    try {
        const userId = req.user.id;
        let cart = await Cart.findOne({ userId });
        if (cart) {
            cart.items = [];
            cart.updatedAt = Date.now();
            await cart.save();
        }
        res.status(200).json({
            success: true,
            message: 'Cart cleared successfully.',
        });
    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to clear cart.',
        });
    }
};
