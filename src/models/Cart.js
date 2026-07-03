import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
    productId: {
        type: String,
        required: true,
    },
    productName: {
        type: String,
        required: true,
    },
    productPrice: {
        type: Number,
        required: true,
    },
    productImage: {
        type: String,
        default: '',
    },
    productQuantity: {
        type: Number,
        required: true,
        default: 1,
    },
    selectedVariant: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    uploadedImage: {
        type: String,
        default: null,
    },
    customizations: {
        type: Map,
        of: String,
        default: {},
    },
});

const cartSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    items: [cartItemSchema],
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

export const Cart = mongoose.model('Cart', cartSchema);
