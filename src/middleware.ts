import { defineMiddleware } from 'astro:middleware';
// @ts-ignore
import { verifyAccessToken, rotateRefreshToken, createAccessToken } from '../workers/utils/auth.js';

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, locals } = context;
  
  // Skip if not running in Cloudflare environment (e.g. during build if not mocked)
  if (!locals.runtime?.env) {
    return next();
  }

  const env = locals.runtime.env as any;

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
    user = verifyAccessToken(accessToken, { JWT_SECRET: jwtSecret });
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
          const dbUser = await env.DB.prepare('SELECT email, name FROM users WHERE id = ?').bind(user_id).first();
          
          if (dbUser) {
             const jwtSecret = await env.JWT_SECRET;
             const newAccessToken = createAccessToken({ sub: user_id, email: dbUser.email, name: dbUser.name }, { JWT_SECRET: jwtSecret });
             
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
             user = { sub: user_id, email: dbUser.email, name: dbUser.name };
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

  return next();
});
