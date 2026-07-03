import { verifyToken, extractToken } from '../utils/tokenService.js';

export const protect = (req, res, next) => {
    try {
        const token = extractToken(req);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route',
            });
        }

        // Verify token
        const decoded = verifyToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({
            success: false,
            message: 'Not authorized to access this route',
        });
    }
};

export const admin = (req, res, next) => {
    if (!req.user?.role || req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required',
        });
    }
    next();
};

export const optional = (req, res, next) => {
    try {
        const token = extractToken(req);

        if (token) {
            const decoded = verifyToken(token);
            req.user = decoded;
        }
        next();
    } catch (error) {
        // Token is optional, so we continue even if verification fails
        next();
    }
};
