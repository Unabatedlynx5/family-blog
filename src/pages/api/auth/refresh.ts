/**
 * Token refresh endpoint
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 */

import type { APIRoute } from 'astro';
import { rotateRefreshToken, createAccessToken } from '../../../../workers/utils/auth.ts';
import type { CloudflareEnv } from '../../../types/cloudflare';

export const prerender = false;

/** User row for refresh */
interface RefreshUserRow {
  email: string;
  name: string;
  role: string;
}

export const POST: APIRoute = async ({ cookies, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  const refreshToken = cookies.get('refresh')?.value;

  if (!refreshToken) {
    return new Response(JSON.stringify({ error: 'No refresh token' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Rotate refresh token
    const result = await rotateRefreshToken(env.DB, refreshToken);
    
    if (!result) {
      // Invalid or revoked token
      cookies.delete('refresh', { path: '/' });
      cookies.delete('accessToken', { path: '/' });
      
      return new Response(JSON.stringify({ error: 'Invalid refresh token' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { user_id, newToken } = result;

    // Get user email for access token
    const user = await env.DB.prepare('SELECT email, name, role FROM users WHERE id = ?')
      .bind(user_id)
      .first<RefreshUserRow>();
    
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const jwtSecret = await env.JWT_SECRET;
    const newAccessToken = createAccessToken({ sub: user_id, email: user.email, name: user.name, role: user.role }, { JWT_SECRET: jwtSecret });

    // Set new refresh token cookie
    cookies.set('refresh', newToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    // Set new access token cookie
    cookies.set('accessToken', newAccessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 15 // 15 minutes
    });

    return new Response(
      JSON.stringify({ 
        accessToken: newAccessToken
      }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Refresh error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
