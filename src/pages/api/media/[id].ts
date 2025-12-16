import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env as any;
  const mediaId = params.id;

  if (!mediaId) {
    return new Response('Media ID required', { status: 400 });
  }

  try {
    // Get media metadata from DB
    const media = await env.DB.prepare(
      'SELECT id, filename, content_type, r2_key FROM media WHERE id = ?'
    ).bind(mediaId).first();

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
        'Content-Type': media.content_type || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000',
        'Content-Disposition': `inline; filename="${media.filename}"`
      }
    });
  } catch (err) {
    console.error('Media fetch error:', err);
    return new Response('Server error', { status: 500 });
  }
};
