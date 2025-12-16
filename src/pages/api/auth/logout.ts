import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  // Clear both cookies
  cookies.delete('accessToken', { path: '/' });
  cookies.delete('refresh', { path: '/' });

  return new Response(
    JSON.stringify({ ok: true }), 
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};
