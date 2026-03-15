/**
 * Auth: password hash/verify, JWT sign/verify.
 * In production JWT_SECRET must be set and must not be the dev default.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SALT_ROUNDS = 10;
const DEV_SECRET = 'dev-secret-change-in-production';
const rawSecret = process.env.JWT_SECRET ?? DEV_SECRET;
const MODE = process.env.MODE ?? process.env.APP_MODE ?? '';
const STRICT_MODES = ['production', 'prod', 'staging', 'demo'];
if ((process.env.NODE_ENV === 'production' || STRICT_MODES.includes(MODE)) && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_SECRET)) {
  throw new Error('JWT_SECRET must be set to a non-default value in production/staging/demo. Set JWT_SECRET in the environment.');
}
const JWT_SECRET = rawSecret;
// Default 4h; production can override via JWT_EXPIRES_IN env var.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '4h';
const JWT_ALGORITHM: jwt.Algorithm = 'HS256';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface JwtPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

export function signToken(payload: JwtPayload): string {
  const options = { algorithm: JWT_ALGORITHM, expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions;
  return jwt.sign(payload as object, JWT_SECRET as jwt.Secret, options);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] }) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}
