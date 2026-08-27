import { randomBytes } from 'node:crypto';

const configuredSecret = process.env.JWT_SECRET;

export const JWT_SECRET = configuredSecret && configuredSecret.length >= 32
  ? configuredSecret
  : randomBytes(48).toString('base64url');

if (!configuredSecret || configuredSecret.length < 32) {
  console.warn('JWT_SECRET is missing or too short; using a temporary in-memory secret until it is configured.');
}