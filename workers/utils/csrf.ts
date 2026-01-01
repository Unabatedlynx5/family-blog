/**
 * CSRF (Cross-Site Request Forgery) protection utilities
 * 
 * Security Fix: HIGH Issue #7 - CSRF Protection
 * 
 * This module provides CSRF token generation and validation to protect
 * state-changing endpoints from cross-site request forgery attacks.
 * 
 * Usage:
 * 1. Generate a token and include it in the page/response
 * 2. Client sends token in X-CSRF-Token header or _csrf body field
 * 3. Server validates token before processing request
 * 
 * Token Format: base64(userId:timestamp:random).signature
 */

import { createHash, randomBytes } from 'crypto';

/** CSRF token validity period (1 hour) */
const CSRF_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Interface for CSRF token with expiry information */
export interface CSRFToken {
  token: string;
  expires: number;
}

/**
 * Generate a CSRF token for a user session
 * 
 * @param userId - User ID to bind token to
 * @param secret - Server secret (JWT_SECRET recommended)
 * @returns CSRF token string and expiration timestamp
 */
export function generateCSRFToken(userId: string, secret: string): CSRFToken {
  const timestamp = Date.now();
  const random = randomBytes(16).toString('hex');
  const data = `${userId}:${timestamp}:${random}`;
  
  const signature = createHash('sha256')
    .update(`${data}:${secret}`)
    .digest('hex')
    .substring(0, 32);
  
  const token = `${Buffer.from(data).toString('base64')}.${signature}`;
  
  return {
    token,
    expires: timestamp + CSRF_TOKEN_TTL_MS
  };
}

/**
 * Verify a CSRF token
 * 
 * @param token - Token to verify
 * @param userId - Expected user ID (from session)
 * @param secret - Server secret used for signing
 * @returns true if token is valid and not expired
 */
export function verifyCSRFToken(token: string, userId: string, secret: string): boolean {
  try {
    if (!token || typeof token !== 'string') return false;
    
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    
    const [dataB64, signature] = parts;
    const data = Buffer.from(dataB64, 'base64').toString();
    const [tokenUserId, timestampStr, random] = data.split(':');
    
    // Verify user ID matches
    if (tokenUserId !== userId) {
      return false;
    }
    
    // Verify timestamp exists and is valid
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      return false;
    }
    
    // Verify not expired
    if (Date.now() > timestamp + CSRF_TOKEN_TTL_MS) {
      return false;
    }
    
    // Verify random exists
    if (!random || random.length < 16) {
      return false;
    }
    
    // Verify signature using constant-time comparison
    const expectedSignature = createHash('sha256')
      .update(`${data}:${secret}`)
      .digest('hex')
      .substring(0, 32);
    
    return timingSafeEqual(signature, expectedSignature);
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 * 
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Extract CSRF token from request (header or body)
 * 
 * @param request - Incoming request
 * @returns CSRF token string or null if not found
 */
export function getCSRFTokenFromRequest(request: Request): string | null {
  // Check header first (preferred method)
  const headerToken = request.headers.get('X-CSRF-Token');
  if (headerToken) {
    return headerToken;
  }
  
  // Also accept from X-XSRF-Token (Angular convention)
  const xsrfToken = request.headers.get('X-XSRF-Token');
  if (xsrfToken) {
    return xsrfToken;
  }
  
  return null;
}

/**
 * Validate Origin/Referer headers as additional CSRF protection
 * This is a defense-in-depth measure alongside token validation
 * 
 * @param request - Incoming request
 * @param allowedOrigins - List of allowed origins (e.g., ['https://example.com'])
 * @returns true if origin is valid or not present (for same-origin requests)
 */
export function validateOrigin(request: Request, allowedOrigins: string[]): boolean {
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  
  // If no Origin header, check Referer
  const sourceOrigin = origin || (referer ? new URL(referer).origin : null);
  
  // If neither header present, could be same-origin (allow with caution)
  // For strict security, return false here
  if (!sourceOrigin) {
    return true; // Allow same-origin requests without Origin header
  }
  
  return allowedOrigins.includes(sourceOrigin);
}

/**
 * Middleware helper to validate CSRF for state-changing requests
 * 
 * @param request - Incoming request
 * @param userId - User ID from session
 * @param secret - Server secret
 * @returns null if valid, or Response with 403 error
 */
export function validateCSRFMiddleware(
  request: Request, 
  userId: string | undefined, 
  secret: string
): Response | null {
  // Only check for state-changing methods
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return null;
  }
  
  // Skip for requests without authentication (they'll fail auth anyway)
  if (!userId) {
    return null;
  }
  
  const token = getCSRFTokenFromRequest(request);
  
  if (!token) {
    return new Response(JSON.stringify({ 
      error: 'CSRF token required',
      hint: 'Include X-CSRF-Token header with your request'
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!verifyCSRFToken(token, userId, secret)) {
    return new Response(JSON.stringify({ 
      error: 'Invalid or expired CSRF token',
      hint: 'Refresh the page and try again'
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return null; // Valid
}
