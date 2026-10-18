import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { config, validateProductionConfig } from './config/config.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import addressRoutes from './routes/addressRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import settingRoutes from './routes/settingRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import aj from './config/arcjet.js';
import { isSpoofedBot } from '@arcjet/inspect';
import dns from "node:dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);
const app = express();
validateProductionConfig();
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

app.use(helmet());
app.use(compression());
app.get('/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? 'ok' : 'unavailable',
    database: databaseConnected ? 'connected' : 'disconnected',
  });
});

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => req.originalUrl.includes('/api/payment/webhook') || req.originalUrl.includes('/api/orders/cashfree-webhook'),
}));

app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}));

const isAllowedOrigin = (origin) => {
  const cleanOrigin = origin.trim().toLowerCase().replace(/\/$/, '');
  if (config.env === 'development' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(cleanOrigin)) return true;
  const allowedOrigins = (config.client_origin || '').split(',').map((value) => value.trim().toLowerCase().replace(/\/$/, ''));
  return allowedOrigins.includes(cleanOrigin);
};

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      if (isAllowedOrigin(origin)) return callback(null, true);
      console.warn(`CORS blocked: origin '${origin}' is not in the allowlist`);

      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    credentials: true,
  })
);
app.use((req, res, next) => {
  const unsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const isWebhook = req.path.includes('/webhook');
  const origin = req.get('origin');

  if (unsafeMethod && !isWebhook && origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ success: false, message: 'Untrusted request origin.' });
  }
  next();
});
app.use(
  express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      // Preserve raw body buffer string for Cashfree webhook signature verification
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ limit: '100kb', extended: false }));
app.use(cookieParser());

// Global Arcjet protection middleware for every route
app.use(async (req, res, next) => {
  // Always bypass Arcjet for health probes and Cashfree Webhooks
  if (
    req.path === '/' ||
    req.path === '/health' ||
    req.path.startsWith('/api/payment/webhook') ||
    req.path.startsWith('/api/payment/cashfree-webhook') ||
    req.path.startsWith('/api/orders/cashfree-webhook')
  ) {
    return next();
  }

  try {
    const clientIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    const decision = await aj.protect(req, {
      requested: 1,
      ...(clientIp ? { ip: clientIp } : {}),
    });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return res.status(429).json({ success: false, error: 'Too many requests' });
      }
      if (decision.reason.isBot()) {
        return res.status(403).json({ success: false, error: 'Bot traffic detected' });
      }
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (decision.ip?.isHosting?.() || decision.results?.some(isSpoofedBot)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    return next();
  } catch (error) {
    console.error('Arcjet protection error:', error);
    // Continue if Arcjet check encounters an error so server remains operational
    return next();
  }
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Auth routes
app.use('/api/auth', authRoutes);

// Product routes
app.use('/api/products', productRoutes);

// Cart routes
app.use('/api/cart', cartRoutes);

// Address routes
app.use('/api/addresses', addressRoutes);

// Contact routes
app.use('/api/contact', contactRoutes);

// Order routes
app.use('/api/orders', orderRoutes);

// Payment & Cashfree routes
app.use('/api/payment', paymentRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Public Settings routes
app.use('/api/settings', settingRoutes);

// Category & Navigation routes
app.use('/api/categories', categoryRoutes);

const startServer = async () => {
  await connectDB();
  app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});