import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { Cart } from '../src/models/Cart.js';
import { config, validateProductionConfig } from '../src/config/config.js';
import { isCashfreePaymentMatchingOrder } from '../src/config/cashfree.js';

test('Cashfree confirmation requires matching amount and INR currency', () => {
    assert.equal(isCashfreePaymentMatchingOrder({ payment_amount: 123.45, payment_currency: 'INR' }, 123.45), true);
    assert.equal(isCashfreePaymentMatchingOrder({ payment_amount: 123.44, payment_currency: 'INR' }, 123.45), false);
    assert.equal(isCashfreePaymentMatchingOrder({ payment_amount: 123.45, payment_currency: 'USD' }, 123.45), false);
    assert.equal(isCashfreePaymentMatchingOrder({ payment_amount: 'invalid', payment_currency: 'INR' }, 123.45), false);
});

test('Cart quantities allow supported batches and reject invalid bounds', async () => {
    const userId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId().toString();
    const cartFor = (productQuantity) => new Cart({
        userId,
        items: [{ productId, productName: 'Product', productPrice: 10, productQuantity }],
    });

    await cartFor(1).validate();
    await cartFor(10000).validate();
    await assert.rejects(cartFor(0).validate());
    await assert.rejects(cartFor(10001).validate());
    await assert.rejects(cartFor(1.5).validate());
});

test('Production configuration rejects missing or insecure values', () => {
    const previous = structuredClone(config);
    try {
        Object.assign(config, {
            env: 'production',
            client_origin: 'https://shop.example',
            api_origin: 'https://api.example',
            mongo_url: 'mongodb://localhost:27017/shop',
            jwt: { accessSecret: 'a'.repeat(32), refreshSecret: 'b'.repeat(32) },
            email: { ...config.email, user: 'mail@example.com', password: 'mail-secret' },
            imagekit: { publicKey: 'public', privateKey: 'private', urlEndpoint: 'https://images.example' },
            arcjet: { key: 'arcjet-key' },
            cashfree: { ...config.cashfree, appId: 'app-id', secretKey: 'secret-key', env: 'PRODUCTION' },
        });
        assert.doesNotThrow(validateProductionConfig);
        config.api_origin = 'http://api.example';
        assert.throws(validateProductionConfig, /HTTPS is required/);
    } finally {
        Object.assign(config, previous);
    }
});