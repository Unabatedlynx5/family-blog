/**
 * Type definitions for Cloudflare Workers environment bindings
 * 
 * This file provides proper TypeScript types for all Cloudflare bindings
 * used in this project, eliminating the need for 'any' type casts.
 * 
 * Security Fix: HIGH Issue #3 - Type Safety
 */

import type { D1Database, R2Bucket, DurableObjectNamespace, Fetcher } from '@cloudflare/workers-types';

/**
 * Environment bindings available to Cloudflare Workers/Pages Functions
 */
export interface CloudflareEnv {
  /** D1 SQLite database for storing users, posts, etc. */
  DB: D1Database;
  
  /** R2 bucket for media file storage */
  MEDIA: R2Bucket;
  
  /** Durable Object for global chat functionality */
  GLOBAL_CHAT: DurableObjectNamespace;
  
  /** Durable Object for post-specific rooms */
  POST_ROOM: DurableObjectNamespace;
  
  /** Static assets fetcher */
  ASSETS: Fetcher;
  
  /** JWT signing secret (required, min 32 chars) */
  JWT_SECRET: string;
  
  /** Admin API key for user creation */
  ADMIN_API_KEY?: string;
  
  /** Environment indicator (development/production) */
  ENVIRONMENT?: 'development' | 'production';
}

/**
 * User payload stored in JWT and available in locals
 */
export interface JWTUserPayload {
  /** User ID (UUID) */
  sub: string;
  /** User email */
  email: string;
  /** User display name */
  name: string;
  /** User role (admin/user) */
  role: string;
  /** Token issued at timestamp */
  iat?: number;
  /** Token expiration timestamp */
  exp?: number;
}

/**
 * Database row types for type-safe queries
 */
export interface DBUser {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  avatar_url: string | null;
  is_active: number;
  role: string;
  birthday: string | null;
  last_seen: number | null;
  created_at: number;
  created_by_admin: number;
}

export interface DBPost {
  id: string;
  user_id: string;
  content: string;
  media_refs: string | null;
  likes: string | null;
  created_at: number;
}

export interface DBComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: number;
}

export interface DBMedia {
  id: string;
  uploader_id: string;
  r2_key: string;
  mime_type: string;
  size: number;
  created_at: number;
}

export interface DBRefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  revoked: number;
  created_at: number;
}

export interface DBPasswordResetToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  used: number;
  created_at: number;
}

export interface DBUserSettings {
  user_id: string;
  theme: string;
  notifications_enabled: number;
  language: string;
  updated_at: number;
}

/**
 * API response types
 */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore?: boolean;
}

export interface ApiErrorResponse {
  error: string;
  retryAfter?: number;
}

/**
 * Helper function to safely get environment from Astro locals
 * Throws a descriptive error if environment is not available
 * 
 * @param locals - Astro locals object
 * @returns CloudflareEnv object with proper typing
 * @throws Error if environment is not available (e.g., during static build)
 */
export function getEnv(locals: App.Locals): CloudflareEnv {
  const runtime = locals.runtime;
  if (!runtime?.env) {
    throw new Error('Cloudflare environment not available. This endpoint requires runtime bindings.');
  }
  return runtime.env as CloudflareEnv;
}

/**
 * Type guard to check if a value is a valid user payload
 */
export function isValidUserPayload(payload: unknown): payload is JWTUserPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.sub === 'string' &&
    typeof p.email === 'string' &&
    typeof p.name === 'string' &&
    typeof p.role === 'string'
  );
}

/**
 * Configuration constants for the application
 * Centralized to make security parameters easily auditable
 */
export const CONFIG = {
  auth: {
    /** Access token TTL in seconds (15 minutes) */
    accessTokenTTL: 15 * 60,
    /** Refresh token TTL in seconds (30 days) */
    refreshTokenTTL: 30 * 24 * 60 * 60,
    /** Maximum refresh tokens per user */
    maxRefreshTokensPerUser: 5,
    /** Maximum login attempts before rate limiting */
    maxLoginAttempts: 5,
    /** Login rate limit window in milliseconds (15 minutes) */
    loginRateLimitWindow: 15 * 60 * 1000,
    /** Minimum JWT secret length */
    minSecretLength: 32,
  },
  upload: {
    /** Maximum file size in bytes (5MB) */
    maxFileSize: 5 * 1024 * 1024,
    /** Maximum avatar size in bytes (2MB) */
    maxAvatarSize: 2 * 1024 * 1024,
    /** Allowed image MIME types */
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const,
    /** Allowed image extensions */
    allowedImageExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const,
    /** Maximum uploads per hour per user */
    maxUploadsPerHour: 10,
  },
  pagination: {
    /** Default items per page */
    defaultLimit: 20,
    /** Maximum items per page */
    maxLimit: 50,
    /** Maximum offset to prevent deep pagination abuse */
    maxOffset: 10000,
  },
  content: {
    /** Maximum post content length */
    maxPostLength: 10000,
    /** Maximum comment content length */
    maxCommentLength: 2000,
    /** Maximum chat message length */
    maxChatMessageLength: 5000,
  },
  rateLimit: {
    /** Media upload: requests per window */
    uploadMaxRequests: 10,
    /** Media upload: window in milliseconds (1 hour) */
    uploadWindowMs: 60 * 60 * 1000,
    /** WebSocket connections: per window */
    wsMaxRequests: 5,
    /** WebSocket: window in milliseconds (1 minute) */
    wsWindowMs: 60 * 1000,
    /** Post creation: per window */
    postMaxRequests: 20,
    /** Post creation: window in milliseconds (1 hour) */
    postWindowMs: 60 * 60 * 1000,
    /** Likes: per window */
    likeMaxRequests: 100,
    /** Likes: window in milliseconds (1 hour) */
    likeWindowMs: 60 * 60 * 1000,
    /** Comments: per window */
    commentMaxRequests: 30,
    /** Comments: window in milliseconds (1 hour) */
    commentWindowMs: 60 * 60 * 1000,
    /** Password reset: per window */
    resetMaxRequests: 3,
    /** Password reset: window in milliseconds (1 hour) */
    resetWindowMs: 60 * 60 * 1000,
  },
} as const;

/**
 * UUID validation regex (RFC 4122)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate a UUID string
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Email validation regex (simplified RFC 5322)
 */
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Validate an email address
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false; // RFC 5321 limit
  return EMAIL_REGEX.test(email);
}
