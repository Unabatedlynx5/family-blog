
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env as any;
  const key = params.key;

  if (!key) {
    return new Response('Avatar key required', { status: 400 });
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
