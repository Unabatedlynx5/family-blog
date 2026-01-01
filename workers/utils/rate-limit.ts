/**
 * Rate limiting utility for authentication and resource-intensive endpoints
 * 
 * Security Features:
 * - In-memory store for rate limiting (per-isolate)
 * - Configurable limits and time windows
 * - Automatic cleanup of expired records
 * 
 * Note: This is in-memory rate limiting which works per Worker isolate.
 * For distributed rate limiting across all instances, consider:
 * - Cloudflare Rate Limiting product (recommended for production)
 * - Durable Objects for persistent state
 * - KV with atomic increments
 * 
 * Security Fix: HIGH Issue #3 - Proper TypeScript types (removed 'any')
 */

/** Rate limit record structure */
interface RateLimitRecord {
  count: number;
  resetTime: number;
}

/** Rate limit info returned to callers */
export interface RateLimitInfo {
  remaining: number;
  reset: number;
  count: number;
}

/** In-memory store for rate limit records */
const requestCounts = new Map<string, RateLimitRecord>();

/**
 * Check if a request should be rate limited
 * 
 * @param key - Unique identifier (e.g., `action:userId` or `action:ip:identifier`)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns true if the request should be blocked (rate limited)
 * 
 * @example
 * // Rate limit login attempts: 5 per 15 minutes per IP+email
 * const key = `login:${clientAddress}:${email}`;
 * if (isRateLimited(key, 5, 15 * 60 * 1000)) {
 *   return new Response('Too many attempts', { status: 429 });
 * }
 */
export function isRateLimited(
  key: string, 
  maxRequests: number = 5, 
  windowMs: number = 15 * 60 * 1000
): boolean {
  const now = Date.now();
  const record = requestCounts.get(key);

  if (!record) {
    // First request - create new record
    requestCounts.set(key, { count: 1, resetTime: now + windowMs });
    return false;
  }

  // Reset if window expired
  if (now > record.resetTime) {
    requestCounts.set(key, { count: 1, resetTime: now + windowMs });
    return false;
  }

  // Increment count
  record.count++;

  // Check if over limit
  return record.count > maxRequests;
}

/**
 * Get rate limit information for response headers
 * 
 * @param key - Unique identifier used in isRateLimited
 * @param maxRequests - Maximum requests (for calculating remaining)
 * @returns Object with remaining requests and reset timestamp
 */
export function getRateLimitInfo(key: string, maxRequests: number = 5): RateLimitInfo {
  const record = requestCounts.get(key);
  const now = Date.now();
  
  if (!record || now > record.resetTime) {
    return { 
      remaining: maxRequests, 
      reset: now + 15 * 60 * 1000,
      count: 0
    };
  }
  
  return {
    remaining: Math.max(0, maxRequests - record.count),
    reset: record.resetTime,
    count: record.count
  };
}

/**
 * Clear rate limit record for a key
 * Useful for clearing after successful authentication
 * 
 * @param key - Unique identifier to clear
 */
export function clearRateLimit(key: string): void {
  requestCounts.delete(key);
}

/**
 * Record an attempt without checking the limit
 * Useful for tracking failed attempts separately
 * 
 * @param key - Unique identifier
 * @param maxRequests - Max requests (unused, kept for API compatibility)
 * @param windowMs - Time window in milliseconds
 */
export function recordAttempt(
  key: string, 
  _maxRequests: number = 5, 
  windowMs: number = 15 * 60 * 1000
): void {
  const now = Date.now();
  const record = requestCounts.get(key);

  if (!record || now > record.resetTime) {
    requestCounts.set(key, { count: 1, resetTime: now + windowMs });
  } else {
    record.count++;
  }
}

/**
 * Clean up expired records to prevent memory leaks
 * Should be called periodically in long-running processes
 */
export function cleanupExpiredRecords(): void {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(key);
    }
  }
}

/**
 * Get the current size of the rate limit store
 * Useful for monitoring memory usage
 */
export function getStoreSize(): number {
  return requestCounts.size;
}

/**
 * Create a rate-limited response with proper headers
 * 
 * @param info - Rate limit info from getRateLimitInfo
 * @param message - Error message to return
 * @returns Response with 429 status and rate limit headers
 */
export function createRateLimitResponse(info: RateLimitInfo, message: string = 'Too many requests'): Response {
  const retryAfter = Math.ceil((info.reset - Date.now()) / 1000);
  
  return new Response(JSON.stringify({ 
    error: message,
    retryAfter
  }), { 
    status: 429,
    headers: { 
      'Content-Type': 'application/json',
      'Retry-After': String(Math.max(1, retryAfter)),
      'X-RateLimit-Remaining': String(info.remaining),
      'X-RateLimit-Reset': String(Math.floor(info.reset / 1000))
    }
  });
}
