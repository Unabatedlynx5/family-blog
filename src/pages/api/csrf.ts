/**
 * CSRF Token endpoint
 * 
 * Security Fix: HIGH Issue #7 - CSRF Protection
 * 
 * Returns a CSRF token for authenticated users to use in subsequent
 * state-changing requests (POST, PUT, PATCH, DELETE).
 * 
 * Usage:
 * 1. GET /api/csrf to obtain a token
 * 2. Include token in X-CSRF-Token header for state-changing requests
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../types/cloudflare.ts';
import { generateCSRFToken } from '../../../workers/utils/csrf.ts';
import { requireAuth } from '../../../workers/utils/validation.ts';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Require authentication to get a CSRF token
  const authError = requireAuth(locals.user);
  if (authError) return authError;
  
  const userId = locals.user!.sub;
  
  try {
    const jwtSecret = await env.JWT_SECRET;
    const { token, expires } = generateCSRFToken(userId, jwtSecret);
    
    return new Response(
      JSON.stringify({ 
        token,
        expires,
        expiresIn: Math.floor((expires - Date.now()) / 1000) // seconds until expiry
      }), 
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          // Prevent caching of CSRF tokens
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        }
      }
    );
  } catch (err) {
    console.error('CSRF token generation error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
