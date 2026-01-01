/**
 * Media fetch endpoint
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - UUID validation for media ID
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv, DBMedia } from '../../../types/cloudflare';
import { isValidUUID } from '../../../types/cloudflare';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  const mediaId = params.id;

  if (!mediaId) {
    return new Response('Media ID required', { status: 400 });
  }
  
  // Security: Validate UUID format
  if (!isValidUUID(mediaId)) {
    return new Response('Invalid media ID format', { status: 400 });
  }

  try {
    // Get media metadata from DB
    const media = await env.DB.prepare(
      'SELECT id, mime_type, r2_key FROM media WHERE id = ?'
    ).bind(mediaId).first<{ id: string; mime_type: string; r2_key: string }>();

    if (!media) {
      return new Response('Media not found', { status: 404 });
    }

    // Get file from R2
    const object = await env.MEDIA.get(media.r2_key);
    
    if (!object) {
      return new Response('File not found in storage', { status: 404 });
    }

    // Return the file with correct content type
    return new Response(object.body, {
      headers: {
        'Content-Type': media.mime_type || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000',
        'Content-Disposition': `inline`
      }
    });
  } catch (err) {
    console.error('Media fetch error:', err);
    return new Response('Server error', { status: 500 });
  }
};
