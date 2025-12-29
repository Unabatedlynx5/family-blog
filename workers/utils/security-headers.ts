/**
 * Security headers utility
 * Add these headers to API responses for additional security
 */

export const SECURITY_HEADERS = {
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Enable XSS protection
  'X-XSS-Protection': '1; mode=block',
  
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Permissions policy
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

/**
 * Add security headers to a Response
 * @param {Response} response - The response to add headers to
 * @returns {Response} - Response with security headers
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
 * @param {object} data - The data to send
 * @param {number} status - HTTP status code
 * @returns {Response}
 */
export function secureJsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS
    }
  });
}
