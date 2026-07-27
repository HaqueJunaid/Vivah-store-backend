import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
    gstRate: {
        type: Number,
        default: 18, // 18% GST default
        required: true
    },
    shippingCost: {
        type: Number,
        default: 50, // 50 default shipping cost
        required: true
    }
}, {
    timestamps: true
});

export const Setting = mongoose.model('Setting', settingSchema);
