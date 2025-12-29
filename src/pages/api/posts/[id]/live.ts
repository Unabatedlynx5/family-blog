import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, params }) => {
  const env = locals.runtime.env as any;
  const postId = params.id;
  
  if (!postId) return new Response('Missing ID', { status: 400 });

  // Get the DO ID for this post
  const id = env.POST_ROOM.idFromName(postId);
  const stub = env.POST_ROOM.get(id);

  // Proxy the WebSocket upgrade request
  return stub.fetch(request);
};
