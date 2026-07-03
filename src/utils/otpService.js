/**
 * Generate random OTP code
 * @returns {string} 6-digit OTP
 */
export const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate OTP expiration time (10 minutes from now)
 * @returns {Date} Date object 10 minutes in future
 */
export const getOTPExpireTime = () => {
    return new Date(Date.now() + 10 * 60 * 1000);
};

/**
 * Check if OTP is expired
 * @param {Date} otpExpireTime - OTP expiration time
 * @returns {boolean} True if expired, false otherwise
 */
export const isOTPExpired = (otpExpireTime) => {
    return new Date() > otpExpireTime;
};
