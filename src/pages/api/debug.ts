import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as any;
  
  return new Response(
    JSON.stringify({ 
      adminKeyPrefix: env.ADMIN_API_KEY ? env.ADMIN_API_KEY.substring(0, 10) + '...' : 'NOT SET',
      jwtSecretPrefix: env.JWT_SECRET ? env.JWT_SECRET.substring(0, 10) + '...' : 'NOT SET',
      message: 'Use these prefixes to verify your environment variables match'
    }), 
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
