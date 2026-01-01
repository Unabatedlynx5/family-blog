/**
 * Members API endpoint - returns active members
 * 
 * Security Fixes Applied:
 * - HIGH Issue #5: Require authentication (member info is private)
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../../types/cloudflare';
import { requireAuth } from '../../../../workers/utils/validation.ts';

export const prerender = false;

/** Member data returned by API */
interface MemberData {
  id: string;
  name: string;
  avatar_url: string | null;
  last_seen: number | null;
}

/** Database row type */
interface MemberRow {
  id: string;
  name: string;
  avatar_url: string | null;
  last_seen: number | null;
}

// Return active members count (last_seen within past 2 minutes)
export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Require authentication - member info is private
  // HIGH Issue #5 Fix
  const authError = requireAuth(locals.user);
  if (authError) return authError;
  
  try {
    const twoMinutesAgo = Math.floor(Date.now() / 1000) - 120;
    
    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) as active FROM users WHERE last_seen IS NOT NULL AND last_seen > ?'
    ).bind(twoMinutesAgo).first<{ active: number }>();
    
    const active = countRow?.active || 0;

    const rows = await env.DB.prepare(
      'SELECT id, name, avatar_url, last_seen FROM users WHERE last_seen IS NOT NULL AND last_seen > ? ORDER BY last_seen DESC LIMIT 100'
    ).bind(twoMinutesAgo).all<MemberRow>();
    
    const members: MemberData[] = (rows.results || []).map((r) => ({ 
      id: r.id, 
      name: r.name, 
      avatar_url: r.avatar_url, 
      last_seen: r.last_seen 
    }));

    return new Response(JSON.stringify({ active, members }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (err) {
    console.error('Members fetch error:', err);
    return new Response(JSON.stringify({ error: 'Server error', active: 0, members: [] }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
