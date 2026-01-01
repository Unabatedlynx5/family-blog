/**
 * Avatar fetch endpoint
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - Path validation to prevent directory traversal
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../../types/cloudflare';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  const key = params.key;

  if (!key) {
    return new Response('Avatar key required', { status: 400 });
  }
  
  // Security: Validate key format to prevent path traversal
  // Avatar keys should start with 'avatars/' and not contain '..'
  if (!key.startsWith('avatars/') || key.includes('..')) {
    return new Response('Invalid avatar key', { status: 400 });
  }

  try {
    const object = await env.MEDIA.get(key);
    
    if (!object) {
      return new Response('Avatar not found', { status: 404 });
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/png',
        'Cache-Control': 'public, max-age=31536000'
      }
    });
  } catch (err) {
    console.error('Avatar fetch error:', err);
    return new Response('Server error', { status: 500 });
  }
};
