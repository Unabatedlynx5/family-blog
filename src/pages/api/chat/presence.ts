/**
 * Chat presence endpoint - update user last_seen
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - Use middleware auth instead of manual token verification
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../../types/cloudflare';
import { requireAuth } from '../../../../workers/utils/validation.ts';

export const prerender = false;

// Update presence for the current user
export const POST: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as CloudflareEnv;

  // Security: Check authentication via middleware
  const authError = requireAuth(locals.user);
  if (authError) return authError;

  const userId = locals.user!.sub;

  try {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now, userId).run();

    return new Response(JSON.stringify({ ok: true, last_seen: now }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (err) {
    console.error('Presence update error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
