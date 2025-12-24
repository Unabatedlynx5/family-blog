import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as any;
  
  // Check authentication via middleware result
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Proxy request to the Durable Object instance
  try {
    const id = env.GLOBAL_CHAT.idFromName('GLOBAL_CHAT');
    const obj = env.GLOBAL_CHAT.get(id);
    
    // Pass user info to DO
    const newRequest = new Request(request);
    newRequest.headers.set('X-User-ID', locals.user.sub);
    newRequest.headers.set('X-User-Email', locals.user.email);
    newRequest.headers.set('X-User-Name', locals.user.name);

  // Fetch avatar
  try {
    const dbUser = await env.DB.prepare('SELECT avatar_url FROM users WHERE id = ?').bind(locals.user.sub).first();
    if (dbUser?.avatar_url) {
      newRequest.headers.set('X-User-Avatar', dbUser.avatar_url);
    }
  } catch (e) {
    console.error('Error fetching avatar for chat connect', e);
  }
  
    return await obj.fetch(newRequest);
  } catch (err) {
    console.error('[Chat Connect] Failed to connect to Durable Object:', err);
    return new Response('Failed to connect to chat server', { status: 502 });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as any;
  try {
    const id = env.GLOBAL_CHAT.idFromName('GLOBAL_CHAT');
    const obj = env.GLOBAL_CHAT.get(id);
    return await obj.fetch(request);
  } catch (err) {
    console.error('[Chat Connect] Failed to delete:', err);
    return new Response('Failed to connect to chat server', { status: 502 });
  }
};
