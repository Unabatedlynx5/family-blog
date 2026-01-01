/**
 * Input validation utilities
 * 
 * Security Fixes:
 * - MEDIUM Issue #11: Content-Type validation
 * - MEDIUM Issue #21: UUID validation
 * - HIGH Issue #9: Content length validation
 * - MEDIUM Issue #15: Standardized error responses
 * - LOW Issue #31: JSON body size limits
 * - LOW Issue #30: API versioning support
 */

import { CONFIG, isValidUUID, isValidEmail } from '../../src/types/cloudflare';

/**
 * Maximum JSON body size (1MB)
 * LOW Issue #31 Fix
 */
const MAX_JSON_BODY_SIZE = 1024 * 1024; // 1MB

/**
 * Current API version
 * LOW Issue #30 Fix
 */
export const API_VERSION = '1';

/**
 * Validate that request has JSON Content-Type
 * 
 * @param request - Incoming request
 * @returns Error response or null if valid
 */
export function validateJsonContentType(request: Request): Response | null {
  const contentType = request.headers.get('Content-Type');
  if (!contentType || !contentType.includes('application/json')) {
    return new Response(JSON.stringify({ 
      error: 'Content-Type must be application/json' 
    }), { 
      status: 415, // Unsupported Media Type
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}

/**
 * Validate Content-Length header for request body size limits
 * Call this BEFORE parsing request body to prevent memory exhaustion
 * 
 * @param request - Incoming request
 * @param maxSize - Maximum allowed size in bytes
 * @returns Error response or null if valid
 */
export function validateContentLength(request: Request, maxSize: number): Response | null {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > maxSize) {
    return new Response(JSON.stringify({ 
      error: `Request body too large (max ${Math.floor(maxSize / 1024)}KB)` 
    }), { 
      status: 413, // Payload Too Large
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}

/**
 * Parse and validate JSON body with size limits
 * LOW Issue #31 Fix: Prevent large JSON payloads from exhausting memory
 * 
 * @param request - Incoming request
 * @param maxSize - Maximum allowed size in bytes (default 1MB)
 * @returns Parsed JSON object or error response
 */
export async function parseJsonBody<T>(
  request: Request, 
  maxSize: number = MAX_JSON_BODY_SIZE
): Promise<T | Response> {
  // Check Content-Length first
  const contentLengthError = validateContentLength(request, maxSize);
  if (contentLengthError) return contentLengthError;
  
  // Validate Content-Type
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;
  
  try {
    const body = await request.json() as T;
    return body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get API version from request header
 * LOW Issue #30 Fix: Support API versioning via header
 * 
 * @param request - Incoming request
 * @returns API version string (defaults to current version)
 */
export function getApiVersion(request: Request): string {
  return request.headers.get('X-API-Version') || API_VERSION;
}

/**
 * Add API version header to response
 * LOW Issue #30 Fix: Include API version in responses
 * 
 * @param response - Response to modify
 * @returns Response with API version header
 */
export function addApiVersionHeader(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-API-Version', API_VERSION);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

/**
 * Validate pagination parameters
 * 
 * @param page - Page number (1-based)
 * @param limit - Items per page
 * @returns Validated and clamped values, or error response
 */
export function validatePagination(
  page: string | null, 
  limit: string | null
): { page: number; limit: number; offset: number } | Response {
  const parsedPage = Math.max(1, parseInt(page || '1', 10) || 1);
  let parsedLimit = parseInt(limit || String(CONFIG.pagination.defaultLimit), 10) || CONFIG.pagination.defaultLimit;
  
  // Clamp limit to allowed range
  parsedLimit = Math.min(Math.max(1, parsedLimit), CONFIG.pagination.maxLimit);
  
  const offset = (parsedPage - 1) * parsedLimit;
  
  // Prevent deep pagination abuse
  if (offset > CONFIG.pagination.maxOffset) {
    return new Response(JSON.stringify({ 
      error: 'Pagination limit exceeded',
      message: `Maximum offset is ${CONFIG.pagination.maxOffset}. Use filters to narrow results.`
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return { page: parsedPage, limit: parsedLimit, offset };
}

/**
 * Validate a post ID parameter
 * 
 * @param id - ID to validate
 * @returns Error response or null if valid
 */
export function validatePostId(id: string | undefined): Response | null {
  if (!id) {
    return new Response(JSON.stringify({ error: 'Post ID required' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!isValidUUID(id)) {
    return new Response(JSON.stringify({ error: 'Invalid post ID format' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return null;
}

/**
 * Validate comment content
 * 
 * @param content - Comment content to validate
 * @returns Trimmed content or error response
 */
export function validateCommentContent(content: unknown): string | Response {
  if (!content || typeof content !== 'string') {
    return new Response(JSON.stringify({ error: 'Content is required' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    return new Response(JSON.stringify({ error: 'Content cannot be empty' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (trimmed.length > CONFIG.content.maxCommentLength) {
    return new Response(JSON.stringify({ 
      error: `Content too long (max ${CONFIG.content.maxCommentLength} characters)` 
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return trimmed;
}

/**
 * Validate post content
 * 
 * @param content - Post content to validate
 * @returns Trimmed content or error response
 */
export function validatePostContent(content: unknown): string | Response {
  if (!content || typeof content !== 'string') {
    return new Response(JSON.stringify({ error: 'Content is required' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    return new Response(JSON.stringify({ error: 'Content cannot be empty' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (trimmed.length > CONFIG.content.maxPostLength) {
    return new Response(JSON.stringify({ 
      error: `Content too long (max ${CONFIG.content.maxPostLength} characters)` 
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return trimmed;
}

/**
 * Validate email format
 * 
 * @param email - Email to validate
 * @returns Error response or null if valid
 */
export function validateEmailFormat(email: unknown): Response | null {
  if (!email || typeof email !== 'string') {
    return new Response(JSON.stringify({ error: 'Email is required' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (!isValidEmail(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email format' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return null;
}

/**
 * Validate password requirements
 * 
 * @param password - Password to validate
 * @returns Error response or null if valid
 */
export function validatePassword(password: unknown): Response | null {
  if (!password || typeof password !== 'string') {
    return new Response(JSON.stringify({ error: 'Password is required' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (password.length < 8) {
    return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (password.length > 128) {
    return new Response(JSON.stringify({ error: 'Password too long (max 128 characters)' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return null;
}

/**
 * Validate file upload
 * 
 * @param file - File to validate
 * @param allowedTypes - Allowed MIME types
 * @param maxSize - Maximum file size in bytes
 * @returns Error response or null if valid
 */
export function validateFileUpload(
  file: File | null,
  allowedTypes: readonly string[] = CONFIG.upload.allowedImageTypes,
  maxSize: number = CONFIG.upload.maxFileSize
): Response | null {
  if (!file) {
    return new Response(JSON.stringify({ error: 'No file provided' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Validate MIME type
  if (!allowedTypes.includes(file.type)) {
    return new Response(JSON.stringify({ 
      error: `Invalid file type. Allowed: ${allowedTypes.join(', ')}` 
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Validate extension
  const ext = file.name.split('.').pop()?.toLowerCase();
  const validExtensions = CONFIG.upload.allowedImageExtensions;
  if (!ext || !validExtensions.includes(ext as typeof validExtensions[number])) {
    return new Response(JSON.stringify({ error: 'Invalid file extension' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Validate size
  if (file.size > maxSize) {
    return new Response(JSON.stringify({ 
      error: `File too large (max ${Math.floor(maxSize / 1024 / 1024)}MB)` 
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return null;
}

/**
 * Require authentication - returns error response if not authenticated
 * 
 * @param user - User from locals
 * @returns Error response or null if authenticated
 */
export function requireAuth(user: App.Locals['user']): Response | null {
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}

/**
 * Require admin role - returns error response if not admin
 * 
 * @param user - User from locals
 * @returns Error response or null if admin
 */
export function requireAdmin(user: App.Locals['user']): Response | null {
  const authError = requireAuth(user);
  if (authError) return authError;
  
  if (user!.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return null;
}

// Re-export validation helpers
export { isValidUUID, isValidEmail };
