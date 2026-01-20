import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, cookies }) => {
  const env = locals.runtime.env as any;
  
  // Use a single "FEED" room for all feed updates
  const id = env.POST_ROOM.idFromName('FEED');
  const stub = env.POST_ROOM.get(id);

  // Extract token from cookie or header
  let token = cookies.get('accessToken')?.value;
  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  const newRequest = new Request(request);
  if (token) {
    newRequest.headers.set('Authorization', `Bearer ${token}`);
  }

  // Proxy the WebSocket upgrade request
  return stub.fetch(newRequest.url, newRequest);
};
