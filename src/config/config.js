import dotenv from 'dotenv';
dotenv.config();

const environment = (process.env.NODE_ENV || 'development').toLowerCase();

export const config = {
    port: process.env.PORT || 3000,
    mongo_url: process.env.MONGO_URL,
    client_origin: process.env.CLIENT_ORIGIN,
    api_origin: process.env.PUBLIC_API_ORIGIN,
    env: environment,
    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || (environment !== 'production' ? 'development-only-access-secret-change-before-deploy' : undefined),
        refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.REFRESH_TOKEN_SECRET || (environment !== 'production' ? 'development-only-refresh-secret-change-before-deploy' : undefined),
        expire: process.env.JWT_EXPIRE || '24h',
    },
    email: {
        ...(process.env.EMAIL_SERVICE ? { service: process.env.EMAIL_SERVICE } : {}),
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: Number(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASSWORD,
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
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
    },
    cashfree: {
        appId: process.env.CASHFREE_APP_ID || '',
        secretKey: process.env.CASHFREE_SECRET_KEY || '',
        env: process.env.CASHFREE_ENV || 'SANDBOX',
        apiVersion: process.env.CASHFREE_API_VERSION || '2023-08-01',
    }
};

export const validateProductionConfig = () => {
    if (config.env !== 'production') return;

    const required = [
        ['JWT_ACCESS_SECRET', config.jwt.accessSecret],
        ['JWT_REFRESH_SECRET', config.jwt.refreshSecret],
        ['CLIENT_ORIGIN', config.client_origin],
        ['PUBLIC_API_ORIGIN', config.api_origin],
        ['MONGO_URL', config.mongo_url],
        ['EMAIL_USER', config.email.user],
        ['EMAIL_PASSWORD', config.email.password],
        ['IMAGEKIT_PUBLIC_KEY', config.imagekit.publicKey],
        ['IMAGEKIT_PRIVATE_KEY', config.imagekit.privateKey],
        ['IMAGEKIT_URL_ENDPOINT', config.imagekit.urlEndpoint],
        ['ARCJET_KEY', config.arcjet.key],
        ['CASHFREE_APP_ID', config.cashfree.appId],
        ['CASHFREE_SECRET_KEY', config.cashfree.secretKey],
    ];
    const missing = required.filter(([, value]) => !value).map(([name]) => name);

    if (config.jwt.accessSecret && config.jwt.accessSecret.length < 32) missing.push('JWT_ACCESS_SECRET (minimum 32 characters)');
    if (config.jwt.refreshSecret && config.jwt.refreshSecret.length < 32) missing.push('JWT_REFRESH_SECRET (minimum 32 characters)');
    if ((config.client_origin || '').split(',').some((origin) => origin.trim() === '*')) missing.push('CLIENT_ORIGIN (wildcards are not allowed)');
    for (const [name, value] of [['CLIENT_ORIGIN', config.client_origin?.split(',')[0]], ['PUBLIC_API_ORIGIN', config.api_origin]]) {
        if (!value) continue;
        try {
            if (new URL(value).protocol !== 'https:') missing.push(`${name} (HTTPS is required)`);
        } catch {
            missing.push(`${name} (must be an absolute URL)`);
        }
    }
    if (config.cashfree.env.toUpperCase() !== 'PRODUCTION') missing.push('CASHFREE_ENV=PRODUCTION');
    const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
    if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) missing.push('TRUST_PROXY_HOPS (must be a non-negative integer)');

    if (missing.length) {
        throw new Error(`Invalid production configuration: ${missing.join(', ')}`);
    }
};