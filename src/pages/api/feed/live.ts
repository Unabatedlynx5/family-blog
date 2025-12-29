import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as any;
  
  // Use a single "FEED" room for all feed updates
  const id = env.POST_ROOM.idFromName('FEED');
  const stub = env.POST_ROOM.get(id);

  // Proxy the WebSocket upgrade request
  return stub.fetch(request);
};
