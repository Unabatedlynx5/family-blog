/**
 * Security headers utility
 * Add these headers to API responses for additional security
 * 
 * Security Fix: HIGH Issue #3 - Proper TypeScript types (removed 'any')
 * MEDIUM Fix: Added Content Security Policy (CSP) headers
 */

/**
 * Content Security Policy for API responses
 * More restrictive since APIs don't serve HTML
 */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/**
 * Content Security Policy for page responses
 * Allows self-hosted scripts/styles and specific external resources
 */
export const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "img-src 'self' data: blob: https://ui-avatars.com https://*.r2.cloudflarestorage.com",
  "font-src 'self'",
  "connect-src 'self' wss://* ws://*",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Enable XSS protection
  'X-XSS-Protection': '1; mode=block',
  
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Permissions policy - restrict browser features
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
  
  // Content Security Policy for APIs
  'Content-Security-Policy': API_CSP,
};

/**
 * Add security headers to a Response
 * @param response - The response to add headers to
 * @returns Response with security headers
 */
export function addSecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newHeaders.set(key, value);
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

/**
 * Create a JSON response with security headers
 * @param data - The data to send (will be JSON stringified)
 * @param status - HTTP status code
 * @returns Response with JSON content-type and security headers
 */
export function secureJsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS
    }
  });
}

/**
 * Create a standardized error response with security headers
 * @param message - Error message to return
 * @param status - HTTP status code
 * @returns Response with error JSON and security headers
 */
export function errorResponse(message: string, status: number): Response {
  return secureJsonResponse({ error: message }, status);
}
/**
 * Generate a unique request ID for tracing
 * Format: timestamp-random (e.g., "1704067200000-a1b2c3d4")
 */
export function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/**
 * Security headers for page responses (with different CSP)
 */
export const PAGE_SECURITY_HEADERS: Record<string, string> = {
  ...SECURITY_HEADERS,
  'Content-Security-Policy': PAGE_CSP,
};

/**
 * Add security headers to a page Response (different CSP for HTML)
 * @param response - The response to add headers to
 * @returns Response with page-appropriate security headers
 */
export function addPageSecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  
  for (const [key, value] of Object.entries(PAGE_SECURITY_HEADERS)) {
    newHeaders.set(key, value);
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

/**
 * Structured log entry for security events
 */
export interface SecurityLogEntry {
  timestamp: string;
  requestId: string;
  event: string;
  userId?: string;
  ip?: string;
  path?: string;
  method?: string;
  details?: Record<string, unknown>;
}

/**
 * Create a structured security log entry (JSON format for Cloudflare logs)
 */
export function securityLog(
  requestId: string,
  event: string,
  details?: {
    userId?: string;
    ip?: string;
    path?: string;
    method?: string;
    extra?: Record<string, unknown>;
  }
): void {
  const entry: SecurityLogEntry = {
    timestamp: new Date().toISOString(),
    requestId,
    event,
    userId: details?.userId,
    ip: details?.ip,
    path: details?.path,
    method: details?.method,
    details: details?.extra,
  };
  
  // Log as JSON for easier parsing in Cloudflare
  console.log(JSON.stringify(entry));
}