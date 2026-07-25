import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        required: false,
        select: false, // Don't include password in queries by default
    },
    provider: {
        type: String,
        enum: ['email', 'google'],
        default: 'email',
    },
    googleId: {
        type: String,
        default: null,
    },
    avatar: {
        type: String,
        default: null,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    otp: {
        type: String,
        select: false, // Don't include OTP in queries by default
    },
    otpExpire: {
        type: Date,
        select: false,
    },
    resetPasswordToken: {
        type: String,
        select: false,
    },
    resetPasswordExpire: {
        type: Date,
        select: false,
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive', 'Suspended'],
        default: 'Active',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Cascade delete addresses when user is removed
userSchema.pre(['deleteOne', 'findOneAndDelete'], async function (next) {
    try {
        const query = this.getQuery ? this.getQuery() : { _id: this._id };
        const user = await this.model.findOne(query);
        if (user) {
            await mongoose.model('Address').deleteMany({ user: user._id });
        }
    } catch (err) {
        console.error('Error cascade deleting addresses:', err);
    }
    next();
});

export const User = mongoose.model('User', userSchema);
