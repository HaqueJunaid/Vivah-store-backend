import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { sendOTPEmail, sendWelcomeEmail, sendPasswordResetEmail } from '../utils/emailService.js';
import { OAuth2Client } from 'google-auth-library';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, setTokenCookie, clearTokenCookie } from '../utils/tokenService.js';
import { generateOTP, getOTPExpireTime, isOTPExpired } from '../utils/otpService.js';
import { config } from '../config/config.js';

const googleClient = new OAuth2Client(config.google.clientId);

// Register User
export const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields',
            });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            if (existingUser.isVerified) {
                return res.status(400).json({
                    success: false,
                    message: 'User already exists with this email',
                });
            }

            // User already registered but not verified: update details and send a new OTP
            const hashedPassword = await bcrypt.hash(password, 10);
            const otp = generateOTP();
            const otpExpire = getOTPExpireTime();

            existingUser.name = name;
            existingUser.password = hashedPassword;
            existingUser.otp = otp;
            existingUser.otpExpire = otpExpire;
            await existingUser.save();

            await sendOTPEmail(existingUser.email, otp, existingUser.name);

            return res.status(200).json({
                success: true,
                message: 'Account already registered but not verified. A new verification OTP has been sent to your email.',
                email: existingUser.email,
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOTP();
        const otpExpire = getOTPExpireTime();

        const user = await User.create({
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            otp,
            otpExpire,
            role: 'user',
        });

        await sendOTPEmail(user.email, otp, user.name);

        res.status(201).json({
            success: true,
            message: 'User registered successfully. Please verify your email with the OTP sent to your email address.',
            email: user.email,
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error registering user',
        });
    }
};

// Verify OTP
export const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and OTP',
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() }).select('+otp +otpExpire');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        if (isOTPExpired(user.otpExpire)) {
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new one.',
            });
        }

        if (user.otp !== otp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP',
            });
        }

        user.isVerified = true;
        user.otp = undefined;
        user.otpExpire = undefined;
        await user.save();

        await sendWelcomeEmail(user.email, user.name);

        const accessToken = generateAccessToken(user._id, user.role);
        const refreshToken = generateRefreshToken(user._id, user.role);
        setTokenCookie(res, accessToken, refreshToken);

        res.status(200).json({
            success: true,
            message: 'Email verified successfully',
            token: accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isVerified: user.isVerified,
                role: user.role,
                provider: user.provider,
                avatar: user.avatar || null,
            },
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error verifying OTP',
        });
    }
};

// Login User
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password',
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
            });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);

        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
            });
        }

        if (!user.isVerified) {
            const otp = generateOTP();
            const otpExpire = getOTPExpireTime();

            user.otp = otp;
            user.otpExpire = otpExpire;
            await user.save();

            await sendOTPEmail(user.email, otp, user.name);

            return res.status(403).json({
                success: false,
                isUnverified: true,
                email: user.email,
                message: 'Your email is not verified. A new verification OTP has been sent to your email address.',
            });
        }

        const accessToken = generateAccessToken(user._id, user.role);
        const refreshToken = generateRefreshToken(user._id, user.role);
        setTokenCookie(res, accessToken, refreshToken);

        res.status(200).json({
            success: true,
            message: 'Logged in successfully',
            token: accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isVerified: user.isVerified,
                role: user.role,
                provider: user.provider,
                avatar: user.avatar || null,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error logging in',
        });
    }
};

// Google Auth
export const googleAuth = async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Google token is required',
            });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: config.google.clientId,
        });

        const payload = ticket.getPayload();

        if (!payload?.email || !payload.email_verified) {
            return res.status(400).json({
                success: false,
                message: 'Unable to verify Google account email',
            });
        }

        const email = payload.email.toLowerCase();
        let user = await User.findOne({ email });

        if (!user) {
            user = await User.create({
                name: payload.name || email.split('@')[0],
                email,
                provider: 'google',
                googleId: payload.sub,
                avatar: payload.picture || null,
                isVerified: true,
                role: 'user',
            });
        } else {
            if (user.provider !== 'google') {
                user.provider = 'google';
            }
            user.googleId = payload.sub;
            user.avatar = payload.picture || user.avatar;
            user.isVerified = true;
            await user.save();
        }

        const accessToken = generateAccessToken(user._id, user.role);
        const refreshToken = generateRefreshToken(user._id, user.role);
        setTokenCookie(res, accessToken, refreshToken);

        res.status(200).json({
            success: true,
            message: 'Logged in with Google successfully',
            token: accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isVerified: user.isVerified,
                role: user.role,
                avatar: user.avatar,
                provider: user.provider,
            },
        });
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error logging in with Google',
        });
    }
};

// Refresh Access Token
export const refreshToken = async (req, res) => {
    try {
        const tokenFromCookie = req.cookies.refreshToken;

        if (!tokenFromCookie) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token missing from cookie',
            });
        }

        const decoded = verifyRefreshToken(tokenFromCookie);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found',
            });
        }

        const newAccessToken = generateAccessToken(user._id, user.role);
        const newRefreshToken = generateRefreshToken(user._id, user.role);
        setTokenCookie(res, newAccessToken, newRefreshToken);

        return res.status(200).json({
            success: true,
            token: newAccessToken,
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired refresh token',
        });
    }
};

// Logout User
export const logout = (req, res) => {
    clearTokenCookie(res);
    res.status(200).json({
        success: true,
        message: 'Logged out successfully',
    });
};

// Get current user
export const getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.status(200).json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isVerified: user.isVerified,
                role: user.role,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching user',
        });
    }
};

// Resend OTP
export const resendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email',
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        if (user.isVerified) {
            return res.status(400).json({
                success: false,
                message: 'User is already verified',
            });
        }

        const otp = generateOTP();
        const otpExpire = getOTPExpireTime();

        user.otp = otp;
        user.otpExpire = otpExpire;
        await user.save();

        await sendOTPEmail(user.email, otp, user.name);

        res.status(200).json({
            success: true,
            message: 'OTP resent successfully',
        });
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error resending OTP',
        });
    }
};

// Get all users (Admin only)
export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}, '-password').lean();

        // Single aggregation for all user order stats instead of N+1 database queries
        const orderStats = await Order.aggregate([
            {
                $group: {
                    _id: '$user',
                    ordersCount: { $sum: 1 },
                    totalSpent: { $sum: '$totalAmount' },
                },
            },
        ]);

        const statsMap = new Map();
        for (const stat of orderStats) {
            if (stat._id) {
                statsMap.set(stat._id.toString(), stat);
            }
        }

        const usersWithStats = users.map((user) => {
            const userStat = statsMap.get(user._id.toString()) || { ordersCount: 0, totalSpent: 0 };
            return {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status || (user.isVerified ? 'Active' : 'Inactive'),
                date: user.createdAt ? new Date(user.createdAt).toISOString().split('T')[0] : 'N/A',
                ordersCount: userStat.ordersCount,
                totalSpent: userStat.totalSpent,
            };
        });

        res.status(200).json({
            success: true,
            users: usersWithStats,
        });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching users',
        });
    }
};

// Update user status (Admin only)
export const updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Please provide status',
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        user.status = status;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'User status updated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
            }
        });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating user status',
        });
    }
};

// Forgot Password
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Please provide an email' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes

        await user.save();

        const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

        try {
            await sendPasswordResetEmail(user.email, resetUrl, user.name);
            res.status(200).json({ success: true, message: 'Password reset email sent' });
        } catch (error) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save();
            return res.status(500).json({ success: false, message: 'Error sending email' });
        }
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Error in forgot password' });
    }
};

// Reset Password
export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ success: false, message: 'Please provide a new password' });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpire: { $gt: Date.now() }
        }).select('+password');

        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired token' });
        }

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, message: 'Error in reset password' });
    }
};
