import { randomUUID, createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// JWT_SECRET should be set as an environment variable in Cloudflare
// For local dev, you can use a default, but never commit real secrets
const ACCESS_TTL = 15 * 60; // 15 minutes

function getJWTSecret(env: any): string {
  return env?.JWT_SECRET || process.env.JWT_SECRET || 'dev-secret-change-me';
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createAccessToken(payload: object, env: any): string {
  const secret = getJWTSecret(env);
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TTL });
}

export function verifyAccessToken(token: string, env: any): jwt.JwtPayload | string | null {
  try {
    const secret = getJWTSecret(env);
    const payload = jwt.verify(token, secret);
    return payload;
  } catch (e) {
    return null;
  }
}

export async function createAndStoreRefreshToken(db: any, userId: string): Promise<string> {
  const token = randomUUID();
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 30 * 24 * 60 * 60;
  await db.prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(randomUUID(), userId, tokenHash, expiresAt, now)
    .run();
  return token;
}

export async function rotateRefreshToken(db: any, token: string): Promise<{ user_id: string; newToken: string } | null> {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const row = await db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > ?').bind(tokenHash, Math.floor(Date.now() / 1000)).first();
  if (!row) return null;
  // revoke old
  await db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').bind(row.id).run();
  // create new
  const newToken = randomUUID();
  const newTokenHash = createHash('sha256').update(newToken).digest('hex');
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 30 * 24 * 60 * 60;
  await db.prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(randomUUID(), row.user_id, newTokenHash, expiresAt, now)
    .run();
  return { user_id: row.user_id, newToken };
}
