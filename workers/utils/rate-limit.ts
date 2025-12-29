/**
 * Rate limiting utility for authentication endpoints
 * Uses in-memory store (consider Cloudflare KV for production)
 */

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const requestCounts = new Map<string, RateLimitRecord>();

/**
 * Check if request should be rate limited
 * @param {string} key - Unique identifier (IP, email, etc.)
 * @param {number} maxRequests - Maximum requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {boolean} - True if rate limited
 */
export function isRateLimited(key: string, maxRequests: number = 5, windowMs: number = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const record = requestCounts.get(key);

  if (!record) {
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
  if (record.count > maxRequests) {
    return true;
  }

  return false;
}

/**
 * Get rate limit info for headers
 * @param {string} key - Unique identifier
 * @returns {object} - Rate limit info
 */
export function getRateLimitInfo(key: string): { remaining: number; reset: number } {
  const record = requestCounts.get(key);
  if (!record) {
    return { remaining: 5, reset: Date.now() + 15 * 60 * 1000 };
  }
  return {
    remaining: Math.max(0, 5 - record.count),
    reset: record.resetTime
  };
}

/**
 * Clean up expired records (call periodically)
 */
export function cleanupExpiredRecords(): void {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(key);
    }
  }
}
