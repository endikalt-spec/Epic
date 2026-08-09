// Payment gateway abstraction.
//
// A provider-agnostic interface so a real processor can be plugged in later
// without touching the checkout flow. Supported methods across providers:
// card (Visa/Mastercard), apple_pay, google_pay.
//
//   createPayment({ amount, currency, method, metadata }) -> { id, status, clientSecret? }
//   getPayment(id)                                          -> { id, status, amount, method }
//   verifyWebhook(rawBody, signature)                      -> event | throws
//
// status is one of: requires_action | processing | succeeded | failed
//
// Two adapters ship here:
//   - mock   (default): fully functional, no keys, simulates the states above.
//   - stripe (real):    lazy-loads the `stripe` package + STRIPE_SECRET_KEY.
//                       Stripe natively supports card, Apple Pay and Google Pay
//                       through PaymentIntents, which is why it's the reference
//                       adapter. Israeli PSPs (Tranzila, Cardcom, PayPlus, Meshulam)
//                       can be added as sibling adapters implementing the same
//                       three methods.
const crypto = require('crypto');
const config = require('./config');

const SUPPORTED_METHODS = ['card', 'apple_pay', 'google_pay'];

// ─────────────────────────── MOCK ADAPTER ───────────────────────────
const mockStore = new Map();

const mockAdapter = {
  name: 'mock',
  async createPayment({ amount, currency = config.payments.currency, method = 'card', metadata = {} }) {
    if (!SUPPORTED_METHODS.includes(method)) throw new Error(`Unsupported method: ${method}`);
    const id = 'pay_mock_' + crypto.randomBytes(8).toString('hex');
    // A demo card ending in 0002 simulates a decline; everything else succeeds.
    const willFail = String(metadata.cardLast4 || '') === '0002';
    const payment = {
      id,
      status: willFail ? 'failed' : 'succeeded',
      amount,
      currency,
      method,
      metadata,
      // A real card flow would return a client secret for SCA/3DS here.
      clientSecret: id + '_secret_' + crypto.randomBytes(6).toString('hex'),
    };
    mockStore.set(id, payment);
    return { id, status: payment.status, clientSecret: payment.clientSecret };
  },
  async getPayment(id) {
    const p = mockStore.get(id);
    if (!p) throw new Error('Payment not found');
    return { id: p.id, status: p.status, amount: p.amount, method: p.method };
  },
  async verifyWebhook() {
    // Mock has no real webhook signature; treat all as trusted in demo.
    return { type: 'mock.event' };
  },
};

// ─────────────────────────── STRIPE ADAPTER ───────────────────────────
function stripeAdapter() {
  let stripe;
  try {
    stripe = require('stripe')(config.payments.stripe.secretKey);
  } catch {
    throw new Error(
      'Stripe adapter selected but the `stripe` package is not installed. ' +
        'Run `npm i stripe` and set STRIPE_SECRET_KEY, or use PAYMENT_PROVIDER=mock.'
    );
  }
  return {
    name: 'stripe',
    async createPayment({ amount, currency = config.payments.currency, method = 'card', metadata = {} }) {
      // Stripe amounts are in the smallest currency unit (agorot for ILS).
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        // card covers Apple Pay / Google Pay via the Payment Request API on the client.
        payment_method_types: ['card'],
        metadata,
      });
      return { id: intent.id, status: intent.status === 'succeeded' ? 'succeeded' : 'requires_action', clientSecret: intent.client_secret };
    },
    async getPayment(id) {
      const intent = await stripe.paymentIntents.retrieve(id);
      return { id: intent.id, status: intent.status, amount: intent.amount / 100, method: 'card' };
    },
    async verifyWebhook(rawBody, signature) {
      return stripe.webhooks.constructEvent(rawBody, signature, config.payments.stripe.webhookSecret);
    },
  };
}

function getGateway() {
  if (config.payments.provider === 'stripe' && config.payments.stripe.secretKey) return stripeAdapter();
  return mockAdapter;
}

module.exports = { getGateway, SUPPORTED_METHODS };
