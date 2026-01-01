/**
 * Post live updates endpoint (WebSocket)
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - UUID validation for post ID
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../../../types/cloudflare';
import { isValidUUID } from '../../../../types/cloudflare';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, params }) => {
  const env = locals.runtime.env as CloudflareEnv;
  const postId = params.id;
  
  if (!postId) {
    return new Response('Missing ID', { status: 400 });
  }
  
  // Security: Validate UUID format
  if (!isValidUUID(postId)) {
    return new Response('Invalid post ID format', { status: 400 });
  }

  // Get the DO ID for this post
  const id = env.POST_ROOM.idFromName(postId);
  const stub = env.POST_ROOM.get(id);

  // Proxy the WebSocket upgrade request
  return stub.fetch(request);
};
