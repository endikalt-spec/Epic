// Central configuration and secrets. Everything reads from the environment so
// the same code runs in demo mode (no external keys) and in production (real
// providers) with only .env changes.
require('dotenv').config();

const bool = (v, d = false) => (v == null ? d : /^(1|true|yes|on)$/i.test(String(v)));

const config = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3001,
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:5173',
  apiUrl: process.env.API_URL || 'http://localhost:3001',

  // Signing secrets. In production these MUST be set to strong random values.
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-jwt-secret-change-me',
  voucherSecret: process.env.VOUCHER_SECRET || 'dev-insecure-voucher-hmac-secret-change-me',

  // Admin API token (protects /api/admin/* CRM read endpoints). When unset the
  // admin API is disabled entirely rather than exposed with a weak default.
  adminToken: process.env.ADMIN_TOKEN || '',

  // Version stamped onto recorded consents so we know which document a customer
  // accepted. Bump this whenever the Terms / Privacy text changes.
  policyVersion: process.env.POLICY_VERSION || '2026-08',

  // ── Auth providers ──
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || '',
    teamId: process.env.APPLE_TEAM_ID || '',
    keyId: process.env.APPLE_KEY_ID || '',
    privateKey: process.env.APPLE_PRIVATE_KEY || '',
    redirectUri: process.env.APPLE_REDIRECT_URI || '',
  },

  // ── Payment gateway ──
  // provider: 'mock' (default, no keys) | 'stripe' (real, needs STRIPE_SECRET_KEY)
  payments: {
    provider: process.env.PAYMENT_PROVIDER || 'mock',
    currency: process.env.PAYMENT_CURRENCY || 'ILS',
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    },
  },

  // ── Email (e-voucher delivery) ──
  email: {
    // transport: 'log' (default, prints to console) | 'smtp'
    transport: process.env.EMAIL_TRANSPORT || 'log',
    from: process.env.EMAIL_FROM || 'VAU <no-reply@vau.co.il>',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 587),
      secure: bool(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },

  // ── CRM / marketing platform ──
  // provider: 'log' (default, no keys — prints intended syncs) | 'brevo' | 'hubspot'
  crm: {
    provider: process.env.CRM_PROVIDER || 'log',
    brevo: {
      apiKey: process.env.BREVO_API_KEY || '',
      listId: process.env.BREVO_LIST_ID || '',
    },
    hubspot: {
      token: process.env.HUBSPOT_TOKEN || '',
    },
    activetrail: {
      token: process.env.ACTIVETRAIL_TOKEN || '',
      groupId: process.env.ACTIVETRAIL_GROUP_ID || '',
    },
  },

  // ── AI gift assistant ──
  assistant: {
    // Uses the Anthropic API when ANTHROPIC_API_KEY is set; otherwise falls
    // back to a deterministic rule-based recommender so the feature always works.
    model: process.env.ASSISTANT_MODEL || 'claude-opus-5',
    hasKey: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  },

  // ── Fraud / anti-abuse ──
  fraud: {
    voucherValidityDays: Number(process.env.VOUCHER_VALIDITY_DAYS || 1826), // ≥5 years (Israeli Consumer Protection Law)
    maxActivationAttemptsPerHour: Number(process.env.MAX_ACTIVATION_ATTEMPTS || 10),
  },
};

config.isDemo = {
  google: !config.google.clientId,
  apple: !config.apple.clientId,
  payments: config.payments.provider === 'mock' || !config.payments.stripe.secretKey,
  email: config.email.transport === 'log',
  assistant: !config.assistant.hasKey,
  crm:
    config.crm.provider === 'log' ||
    (config.crm.provider === 'brevo' && !config.crm.brevo.apiKey) ||
    (config.crm.provider === 'hubspot' && !config.crm.hubspot.token) ||
    (config.crm.provider === 'activetrail' && !config.crm.activetrail.token),
};

module.exports = config;
