import express from 'express';
import {
    register,
    verifyOTP,
    login,
    logout,
    getCurrentUser,
    resendOTP,
    googleAuth,
    refreshToken,
    getAllUsers,
    updateUserStatus,
    forgotPassword,
    resetPassword,
} from '../controllers/authController.js';
import { protect, admin } from '../middlewares/auth.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/verify-otp', verifyOTP);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/resend-otp', resendOTP);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);

// Protected routes
router.get('/me', protect, getCurrentUser);
router.post('/logout', protect, logout);

// Admin-only user management routes
router.get('/users', protect, admin, getAllUsers);
router.put('/users/:id/status', protect, admin, updateUserStatus);

// Admin-only route example
router.get('/admin-check', protect, admin, (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Admin access confirmed',
    });
});

export default router;
