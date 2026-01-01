/**
 * CSRF Token Management for Client-Side
 * 
 * This module provides client-side CSRF token management.
 * Tokens are cached and automatically refreshed when expired.
 * 
 * Usage:
 * ```javascript
 * import { fetchWithCSRF } from '/scripts/csrf-client.js';
 * 
 * // Use instead of fetch for state-changing requests
 * const res = await fetchWithCSRF('/api/posts', {
 *   method: 'POST',
 *   body: JSON.stringify({ content: 'Hello' })
 * });
 * ```
 */

// Cache token in memory
let cachedToken = null;
let tokenExpires = 0;

/**
 * Get a valid CSRF token, fetching a new one if needed
 * @returns {Promise<string|null>} CSRF token or null if not authenticated
 */
export async function getCSRFToken() {
  // Return cached token if still valid (with 1 minute buffer)
  if (cachedToken && Date.now() < tokenExpires - 60000) {
    return cachedToken;
  }
  
  try {
    const res = await fetch('/api/csrf', {
      method: 'GET',
      credentials: 'same-origin'
    });
    
    if (res.status === 401) {
      // Not authenticated
      cachedToken = null;
      tokenExpires = 0;
      return null;
    }
    
    if (!res.ok) {
      console.error('Failed to get CSRF token:', res.status);
      return null;
    }
    
    const data = await res.json();
    cachedToken = data.token;
    tokenExpires = data.expires;
    return cachedToken;
  } catch (err) {
    console.error('Error fetching CSRF token:', err);
    return null;
  }
}

/**
 * Clear the cached token (call on logout)
 */
export function clearCSRFToken() {
  cachedToken = null;
  tokenExpires = 0;
}

/**
 * Fetch wrapper that automatically includes CSRF token
 * for state-changing requests (POST, PUT, PATCH, DELETE)
 * 
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithCSRF(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  
  // Only add CSRF token for state-changing methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = await getCSRFToken();
    
    if (token) {
      options.headers = {
        ...options.headers,
        'X-CSRF-Token': token
      };
    }
  }
  
  // Always include credentials for same-origin
  options.credentials = options.credentials || 'same-origin';
  
  return fetch(url, options);
}

// Make available globally for inline scripts
if (typeof window !== 'undefined') {
  window.csrfClient = {
    getCSRFToken,
    clearCSRFToken,
    fetchWithCSRF
  };
}
