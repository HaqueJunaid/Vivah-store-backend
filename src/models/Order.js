import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    productImage: {
        type: String,
        default: '',
    },
    selectedVariant: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    customizations: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    uploadedImage: {
        type: String,
        default: '',
    }
});

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    items: [orderItemSchema],
    shippingAddress: {
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        company: { type: String, default: '' },
        country: { type: String, required: true },
        address: { type: String, required: true },
        apartment: { type: String, default: '' },
        city: { type: String, required: true },
        postalCode: { type: String, required: true },
        phone: { type: String, required: true },
    },
    subtotal: {
        type: Number,
        default: 0
    },
    shippingCost: {
        type: Number,
        default: 0
    },
    gstAmount: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true,
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'card', 'upi', 'mock'],
        default: 'mock',
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed'],
        default: 'Pending',
    },
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Pending',
        index: true,
    },
}, {
    timestamps: true,
});

// Performance indexes for faster querying and sorting
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
