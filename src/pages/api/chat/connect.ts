import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as any;
  
  // Proxy request to the Durable Object instance
  const id = env.GLOBAL_CHAT.idFromName('GLOBAL_CHAT');
  const obj = env.GLOBAL_CHAT.get(id);
  
  return obj.fetch(request);
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as any;
  const id = env.GLOBAL_CHAT.idFromName('GLOBAL_CHAT');
  const obj = env.GLOBAL_CHAT.get(id);
  return obj.fetch(request);
};
