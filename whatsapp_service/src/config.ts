import dotenv from 'dotenv';
dotenv.config();

// Written in the source, so it protects nothing outside a laptop.
const DEVELOPMENT_SECRET = 'scaleezy_internal_secret_key_2026';

export const config = {
  PORT: process.env.PORT || 3001,
  DJANGO_BACKEND_URL: process.env.DJANGO_BACKEND_URL || 'http://127.0.0.1:8000',
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET || DEVELOPMENT_SECRET,
  NODE_ENV: process.env.NODE_ENV || 'development'
};

/**
 * Why this service must not start, or null. The secret is all that keeps the
 * pairing QR and message sending private, so production never runs on the
 * development one. RENDER as well as NODE_ENV, the same signal the Django health
 * check uses, because a host may leave NODE_ENV unset.
 */
export function productionSecretProblem(): string | null {
  const production = config.NODE_ENV === 'production' || Boolean(process.env.RENDER);
  if (production && config.INTERNAL_API_SECRET === DEVELOPMENT_SECRET) {
    return 'INTERNAL_API_SECRET is unset or still the development default. Set it to a private value, the same one Django uses.';
  }
  return null;
}
