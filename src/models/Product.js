import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
        min: 0.5,
    },
    quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
    },
    category: {
        type: String,
        required: true,
        enum: [
            'assets',
            'boards & signage',
            'room stationery',
            'utility stationery',
            'fun & entertainment',
            'thermatic elements',
            'favour & gifts',
            'invites & planner'
        ],
        lowercase: true,
    },
    subCategory: {
        type: String,
        default: null,
        lowercase: true,
    },
    imageUrls: [{
        type: String,
    }],
    hasVariants: {
        type: Boolean,
        default: false,
    },
    variantTitle: {
        type: String,
        default: null,
    },
    variantImages: [{
        type: String,
    }],
    isCustomizable: {
        type: Boolean,
        default: false,
    },
    customizations: [{
        type: String,
    }],
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

export const Product = mongoose.model('Product', productSchema);