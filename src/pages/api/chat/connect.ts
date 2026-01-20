import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, cookies }) => {
  const env = locals.runtime.env as any;
  
  // Check authentication via middleware result
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Proxy request to the Durable Object instance
  try {
    const id = env.GLOBAL_CHAT.idFromName('GLOBAL_CHAT');
    const obj = env.GLOBAL_CHAT.get(id);
    
    // Extract token from cookie or header
    let token = cookies.get('accessToken')?.value;
    if (!token) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    const newRequest = new Request(request);

    // Pass token in URL query string for the DO (as requested by GlobalChat spec)
    const url = new URL(newRequest.url);
    if (token) {
      url.searchParams.set('token', token);
    }
    
    // Also clear custom headers if they were there (not needed now)
    newRequest.headers.delete('X-User-ID');
    newRequest.headers.delete('X-User-Email'); 
    newRequest.headers.delete('X-User-Name');
    newRequest.headers.delete('X-User-Avatar');

    return await obj.fetch(url.toString(), newRequest);
  } catch (err) {
    console.error('[Chat Connect] Failed to connect to Durable Object:', err);
    return new Response('Failed to connect to chat server', { status: 502 });
  }
};

export const DELETE: APIRoute = async ({ request, locals, cookies }) => {
  const env = locals.runtime.env as any;
  
  // Check authentication
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const id = env.GLOBAL_CHAT.idFromName('GLOBAL_CHAT');
    const obj = env.GLOBAL_CHAT.get(id);
    
    const newRequest = new Request(request);
    let token = cookies.get('accessToken')?.value;
    if (!token) {
        const authHeader = request.headers.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
    }
    
    if (token) {
        newRequest.headers.set('Authorization', `Bearer ${token}`);
    }

    return await obj.fetch(newRequest.url, newRequest);
  } catch (err) {
    console.error('[Chat Connect] Failed to delete:', err);
    return new Response('Failed to connect to chat server', { status: 502 });
  }
};
