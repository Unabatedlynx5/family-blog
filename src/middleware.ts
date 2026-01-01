import { defineMiddleware } from 'astro:middleware';
// @ts-ignore
import { verifyAccessToken, rotateRefreshToken, createAccessToken } from '../workers/utils/auth.js';
// @ts-ignore
import { validateCSRFMiddleware, validateOrigin } from '../workers/utils/csrf.js';
// @ts-ignore
import { addSecurityHeaders, addPageSecurityHeaders, generateRequestId, securityLog } from '../workers/utils/security-headers.js';
// @ts-ignore
import { API_VERSION } from '../workers/utils/validation.js';

/**
 * Endpoints that are exempt from CSRF validation
 * - Auth endpoints handle their own protection via other means
 * - WebSocket upgrades don't need CSRF
 */
const CSRF_EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/chat/connect',  // WebSocket upgrade
  '/api/feed/live',     // WebSocket upgrade
];

/**
 * Check if a path should skip CSRF validation
 */
function isCSRFExempt(pathname: string): boolean {
  // Check exact matches
  if (CSRF_EXEMPT_PATHS.includes(pathname)) {
    return true;
  }
  // Check paths that start with exempt patterns (for dynamic routes)
  if (pathname.startsWith('/api/posts/') && pathname.endsWith('/live')) {
    return true; // WebSocket endpoints like /api/posts/[id]/live
  }
  return false;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, locals } = context;
  
  // Generate request ID for tracing
  const requestId = generateRequestId();
  locals.requestId = requestId;
  
  // Skip if not running in Cloudflare environment (e.g. during build if not mocked)
  if (!locals.runtime?.env) {
    return next();
  }

  const env = locals.runtime.env as any;
  const url = new URL(context.request.url);
  const method = context.request.method.toUpperCase();
  const clientIp = context.request.headers.get('CF-Connecting-IP') || 'unknown';

  // 1. Check Access Token
  let accessToken = cookies.get('accessToken')?.value;
  
  if (!accessToken) {
    const authHeader = context.request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);
    }
  }

  let user = null;

  if (accessToken) {
    const jwtSecret = await env.JWT_SECRET;
    const decoded = verifyAccessToken(accessToken, { JWT_SECRET: jwtSecret });
    if (decoded && typeof decoded !== 'string') {
      user = decoded as any;
    }
  }

  // 2. If no valid access token, try refresh token
  if (!user) {
    const refreshToken = cookies.get('refresh')?.value;
    if (refreshToken) {
      try {
        const result = await rotateRefreshToken(env.DB, refreshToken);
        
        if (result) {
          const { user_id, newToken } = result;
          
          // Get user details (email, name)
          const dbUser = await env.DB.prepare('SELECT email, name, role FROM users WHERE id = ?').bind(user_id).first();
          
          if (dbUser) {
             const jwtSecret = await env.JWT_SECRET;
             const newAccessToken = createAccessToken({ sub: user_id, email: dbUser.email, name: dbUser.name, role: dbUser.role }, { JWT_SECRET: jwtSecret });
             
             // Update cookies
             cookies.set('accessToken', newAccessToken, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                maxAge: 15 * 60 // 15 minutes
             });
             
             cookies.set('refresh', newToken, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                maxAge: 30 * 24 * 60 * 60 // 30 days
             });
             
             // Set user for this request
             user = { sub: user_id, email: dbUser.email, name: dbUser.name, role: dbUser.role };
          }
        } else {
            // Invalid refresh token - clear cookies
            cookies.delete('refresh', { path: '/' });
            cookies.delete('accessToken', { path: '/' });
        }
      } catch (e) {
        // Log error but don't expose details
        console.error("Middleware refresh error");
        // Clear potentially compromised tokens
        cookies.delete('refresh', { path: '/' });
        cookies.delete('accessToken', { path: '/' });
      }
    }
  }

  // Make user available to pages
  locals.user = user;

  // CSRF Protection for state-changing API requests
  // HIGH Issue #7 Fix - Prevent cross-site request forgery attacks
  if (url.pathname.startsWith('/api/') && 
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
      !isCSRFExempt(url.pathname)) {
    
    // Validate Origin header as defense-in-depth
    const host = context.request.headers.get('Host') || '';
    const protocol = url.protocol;
    const allowedOrigins = [
      `${protocol}//${host}`,
      // Add production domain if different
    ].filter(Boolean);
    
    if (!validateOrigin(context.request, allowedOrigins)) {
      securityLog(requestId, 'CSRF_ORIGIN_REJECTED', {
        ip: clientIp,
        path: url.pathname,
        method,
        userId: locals.user?.sub,
        extra: { origin: context.request.headers.get('Origin') }
      });
      
      return addSecurityHeaders(new Response(JSON.stringify({ 
        error: 'Invalid request origin'
      }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    // Validate CSRF token for authenticated requests
    if (locals.user) {
      const jwtSecret = await env.JWT_SECRET;
      const csrfError = validateCSRFMiddleware(
        context.request, 
        locals.user.sub, 
        jwtSecret
      );
      
      if (csrfError) {
        securityLog(requestId, 'CSRF_TOKEN_INVALID', {
          ip: clientIp,
          path: url.pathname,
          method,
          userId: locals.user.sub
        });
        return addSecurityHeaders(csrfError);
      }
    }
  }

  // Route Guard: Protect /admin routes
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin')) {
    if (!locals.user || locals.user.role !== 'admin') {
      // Log security event
      securityLog(requestId, 'ADMIN_ACCESS_DENIED', {
        ip: clientIp,
        path: url.pathname,
        method,
        userId: locals.user?.sub
      });
      
      // Return 403 for API, Redirect for Pages
      if (url.pathname.startsWith('/api/')) {
        return addSecurityHeaders(new Response(JSON.stringify({ error: 'Forbidden' }), { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }));
      } else {
        return context.redirect('/');
      }
    }
  }

  // Process the request and add security headers to response
  const response = await next();
  
  // Add security headers based on response type
  const contentType = response.headers.get('Content-Type') || '';
  
  // LOW Issue #30 Fix: Add API version header to API responses
  let finalResponse: Response;
  
  if (url.pathname.startsWith('/api/') || contentType.includes('application/json')) {
    // API responses get stricter CSP and version header
    finalResponse = addSecurityHeaders(response);
    const headers = new Headers(finalResponse.headers);
    headers.set('X-API-Version', API_VERSION);
    return new Response(finalResponse.body, {
      status: finalResponse.status,
      statusText: finalResponse.statusText,
      headers
    });
  } else if (contentType.includes('text/html')) {
    // Page responses get page-appropriate CSP
    return addPageSecurityHeaders(response);
  }
  
  // Other responses (images, etc.) get basic security headers
  return addSecurityHeaders(response);
});
