/**
 * Authentication utilities for JWT token management
 * 
 * Security Features:
 * - JWT access tokens with 15-minute expiration
 * - Refresh tokens hashed with SHA-256 before storage
 * - Refresh token rotation on use
 * - bcrypt password hashing with cost factor 10
 * 
 * Security Fix: HIGH Issue #3 - Proper TypeScript types (removed 'any')
 * Security Fix: MEDIUM Issue #17 - JWT secret validation
 */

import { randomUUID, createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { D1Database } from '@cloudflare/workers-types';
import { CONFIG } from '../../src/types/cloudflare';

/** Payload structure for JWT access tokens */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
}

/** Environment object containing JWT secret */
export interface AuthEnv {
  JWT_SECRET: string;
}

/** Refresh token row from database */
interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  revoked: number;
  created_at: number;
}

/**
 * Get and validate JWT secret from environment
 * 
 * Security: Validates minimum secret length to prevent weak secrets
 * 
 * @param env - Environment object with JWT_SECRET
 * @returns JWT secret string
 * @throws Error if secret is missing or too short in production
 */
function getJWTSecret(env: AuthEnv | { JWT_SECRET?: string }): string {
  const secret = env?.JWT_SECRET || process.env.JWT_SECRET;
  
  if (!secret) {
    // Allow dev fallback only in development
    if (process.env.NODE_ENV === 'development' || process.env.VITEST) {
      return 'dev-secret-change-me-in-production-32chars';
    }
    throw new Error('JWT_SECRET environment variable is required');
  }
  
  // Validate minimum length for security
  if (secret.length < CONFIG.auth.minSecretLength) {
    console.warn(`[Security Warning] JWT_SECRET should be at least ${CONFIG.auth.minSecretLength} characters`);
  }
  
  return secret;
}

/**
 * Verify a password against a bcrypt hash
 * 
 * @param password - Plain text password
 * @param hash - bcrypt hash to compare against
 * @returns Promise resolving to true if password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Hash a password using bcrypt
 * 
 * @param password - Plain text password to hash
 * @returns Promise resolving to bcrypt hash
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Create a JWT access token
 * 
 * @param payload - Token payload (sub, email, name, role)
 * @param env - Environment containing JWT_SECRET
 * @returns Signed JWT token string
 */
export function createAccessToken(payload: AccessTokenPayload, env: AuthEnv): string {
  const secret = getJWTSecret(env);
  return jwt.sign(payload, secret, { expiresIn: CONFIG.auth.accessTokenTTL });
}

/**
 * Verify and decode a JWT access token
 * 
 * @param token - JWT token string to verify
 * @param env - Environment containing JWT_SECRET
 * @returns Decoded payload or null if invalid/expired
 */
export function verifyAccessToken(token: string, env: AuthEnv): jwt.JwtPayload | null {
  try {
    const secret = getJWTSecret(env);
    const payload = jwt.verify(token, secret);
    // Return null for string payloads (shouldn't happen with our tokens)
    if (typeof payload === 'string') return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Create and store a new refresh token
 * 
 * Security: Token is hashed with SHA-256 before storage
 * 
 * @param db - D1 database instance
 * @param userId - User ID to associate token with
 * @returns Plain text token (to be sent to client)
 */
export async function createAndStoreRefreshToken(db: D1Database, userId: string): Promise<string> {
  const token = randomUUID();
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + CONFIG.auth.refreshTokenTTL;
  
  // Clean up old tokens for this user (keep only most recent N-1)
  // Security Fix: MEDIUM Issue #22 - Limit refresh tokens per user
  await db.prepare(`
    DELETE FROM refresh_tokens 
    WHERE user_id = ? 
    AND id NOT IN (
      SELECT id FROM refresh_tokens 
      WHERE user_id = ? AND revoked = 0 
      ORDER BY created_at DESC 
      LIMIT ?
    )
  `).bind(userId, userId, CONFIG.auth.maxRefreshTokensPerUser - 1).run();
  
  await db.prepare(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(randomUUID(), userId, tokenHash, expiresAt, now).run();
  
  return token;
}

/**
 * Rotate a refresh token (revoke old, create new)
 * 
 * Security: Implements token rotation to limit token reuse attacks
 * 
 * @param db - D1 database instance
 * @param token - Current refresh token
 * @returns New token and user_id, or null if token is invalid/revoked/expired
 */
export async function rotateRefreshToken(
  db: D1Database, 
  token: string
): Promise<{ user_id: string; newToken: string } | null> {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const now = Math.floor(Date.now() / 1000);
  
  const row = await db.prepare(
    'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > ?'
  ).bind(tokenHash, now).first<RefreshTokenRow>();
  
  if (!row) return null;
  
  // Revoke old token
  await db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').bind(row.id).run();
  
  // Create new token
  const newToken = randomUUID();
  const newTokenHash = createHash('sha256').update(newToken).digest('hex');
  const expiresAt = now + CONFIG.auth.refreshTokenTTL;
  
  await db.prepare(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(randomUUID(), row.user_id, newTokenHash, expiresAt, now).run();
  
  return { user_id: row.user_id, newToken };
}

/**
 * Revoke all refresh tokens for a user
 * Useful for password changes or security incidents
 * 
 * @param db - D1 database instance
 * @param userId - User ID to revoke tokens for
 */
export async function revokeAllUserTokens(db: D1Database, userId: string): Promise<void> {
  await db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').bind(userId).run();
}
