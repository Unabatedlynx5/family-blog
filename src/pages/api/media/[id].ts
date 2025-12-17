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
    // Note: Schema uses mime_type, not content_type. And filename is not in the schema shown in migration 001.
    // Let's check if filename exists or if we should just use mime_type.
    // Based on migration 001, there is no filename column.
    const media = await env.DB.prepare(
      'SELECT id, mime_type, r2_key FROM media WHERE id = ?'
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
