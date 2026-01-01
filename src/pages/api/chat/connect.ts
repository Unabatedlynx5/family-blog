/**
 * WebSocket connection endpoint for real-time chat
 * 
 * Security Fixes Applied:
 * - CRITICAL Issue #2: Rate limiting for WebSocket connections
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../../types/cloudflare';
import { CONFIG } from '../../../types/cloudflare';
import { isRateLimited, getRateLimitInfo, createRateLimitResponse } from '../../../../workers/utils/rate-limit.ts';
import { requireAuth } from '../../../../workers/utils/validation.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Check authentication via middleware result
  const authError = requireAuth(locals.user);
  if (authError) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const userId = locals.user!.sub;
  
  // Security: Rate limit WebSocket connections
  // CRITICAL Issue #2 Fix - prevent connection spam and Durable Object abuse
  const rateLimitKey = `ws:${userId}`;
  if (isRateLimited(rateLimitKey, CONFIG.rateLimit.wsMaxRequests, CONFIG.rateLimit.wsWindowMs)) {
    const info = getRateLimitInfo(rateLimitKey, CONFIG.rateLimit.wsMaxRequests);
    return createRateLimitResponse(info, 'Too many connection attempts. Please wait before reconnecting.');
  }
  
  // Proxy request to the Durable Object instance
  try {
    const id = env.GLOBAL_CHAT.idFromName('GLOBAL_CHAT');
    const obj = env.GLOBAL_CHAT.get(id);
    
    // Pass user info to DO
    const newRequest = new Request(request);
    newRequest.headers.set('X-User-ID', userId);
    newRequest.headers.set('X-User-Email', locals.user!.email);
    newRequest.headers.set('X-User-Name', locals.user!.name);

    // Fetch avatar
    try {
      const dbUser = await env.DB.prepare('SELECT avatar_url FROM users WHERE id = ?')
        .bind(userId)
        .first<{ avatar_url: string | null }>();
      if (dbUser?.avatar_url) {
        newRequest.headers.set('X-User-Avatar', dbUser.avatar_url);
      }
    } catch (e) {
      console.error('Error fetching avatar for chat connect', e);
    }
  
    return await obj.fetch(newRequest);
  } catch (err) {
    console.error('[Chat Connect] Failed to connect to Durable Object:', err);
    return new Response('Failed to connect to chat server', { status: 502 });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Require authentication for delete as well
  const authError = requireAuth(locals.user);
  if (authError) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    const id = env.GLOBAL_CHAT.idFromName('GLOBAL_CHAT');
    const obj = env.GLOBAL_CHAT.get(id);
    return await obj.fetch(request);
  } catch (err) {
    console.error('[Chat Connect] Failed to delete:', err);
    return new Response('Failed to connect to chat server', { status: 502 });
  }
};
