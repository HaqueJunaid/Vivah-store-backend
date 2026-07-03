import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';

/**
 * Generate Access Token (30 minutes)
 */
export const generateAccessToken = (id, role = 'user') => {
    return jwt.sign({ id, role, type: 'access' }, config.jwt.accessSecret, {
        expiresIn: '30m',
    });
};

/**
 * Generate Refresh Token (48 hours)
 */
export const generateRefreshToken = (id, role = 'user') => {
    return jwt.sign({ id, role, type: 'refresh' }, config.jwt.refreshSecret, {
        expiresIn: '48h',
    });
};

// Backward compatibility helper
export const generateToken = generateAccessToken;

/**
 * Verify Access Token
 */
export const verifyToken = (token) => {
    try {
        return jwt.verify(token, config.jwt.accessSecret);
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
};

/**
 * Verify Refresh Token
 */
export const verifyRefreshToken = (token) => {
    try {
        return jwt.verify(token, config.jwt.refreshSecret);
    } catch (error) {
        throw new Error('Invalid or expired refresh token');
    }
};

/**
 * Extract access token from request (Headers or Cookie)
 */
export const extractToken = (req) => {
    return req.cookies.token || req.headers.authorization?.split(' ')[1] || null;
};

/**
 * Set token cookies in response securely
 */
export const setTokenCookie = (res, accessToken, refreshToken) => {
    if (accessToken) {
        res.cookie('token', accessToken, {
            httpOnly: true,
            secure: config.env === 'production',
            sameSite: 'lax',
            maxAge: 30 * 60 * 1000, // 30 mins
        });
    }
    if (refreshToken) {
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true, // Prevents JavaScript access (XSS defense)
            secure: config.env === 'production',
            sameSite: 'lax',
            path: '/api/auth', // Transmitted only to auth endpoints
            maxAge: 48 * 60 * 60 * 1000, // 48 hours
        });
    }
};

/**
 * Clear token cookies
 */
export const clearTokenCookie = (res) => {
    res.clearCookie('token');
    res.clearCookie('refreshToken', { path: '/api/auth' });
};
