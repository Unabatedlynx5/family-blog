/**
 * Logout endpoint
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 */

import type { APIRoute } from 'astro';
import { createHash } from 'crypto';
import type { CloudflareEnv } from '../../../types/cloudflare';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, locals }) => {
  const env = locals.runtime?.env as CloudflareEnv | undefined;
  const refreshToken = cookies.get('refresh')?.value;

  if (refreshToken && env?.DB) {
    try {
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      await env.DB.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?')
        .bind(tokenHash)
        .run();
    } catch (err) {
      console.error('Logout revoke error:', err);
      // Continue to clear cookies even if revocation fails
    }
  }

  // Clear both cookies
  cookies.delete('accessToken', { path: '/' });
  cookies.delete('refresh', { path: '/' });

  return new Response(
    JSON.stringify({ ok: true }), 
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};
