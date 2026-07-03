import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    mongo_url: process.env.MONGO_URL,
    env: process.env.NODE_ENV || 'development',
    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'your-access-secret-key',
        refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.REFRESH_TOKEN_SECRET || 'your-refresh-secret-key',
        expire: process.env.JWT_EXPIRE || '24h',
    },
    email: {
        service: process.env.EMAIL_SERVICE || 'gmail',
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_SECURE || false,
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASSWORD,
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
    },
    arcjet: {
        dev: process.env.ARCJET_ENV,
        key: process.env.ARCJET_KEY
    },
    imagekit: {
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    }
};