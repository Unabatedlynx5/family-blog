/**
 * Debug endpoint - environment check
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - Admin-only access enforced
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../types/cloudflare';
import { requireAdmin } from '../../../workers/utils/validation.ts';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Require admin privileges
  const authError = requireAdmin(locals.user);
  if (authError) return authError;
  
  return new Response(
    JSON.stringify({ 
      hasAdminKey: !!env.ADMIN_API_KEY,
      hasJWTSecret: !!env.JWT_SECRET,
      hasDB: !!env.DB,
      hasMediaBucket: !!env.MEDIA,
      hasChatDO: !!env.GLOBAL_CHAT,
      message: 'Environment check complete'
    }), 
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
