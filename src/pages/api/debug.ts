import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as any;
  
  // Require authentication
  if (!locals.user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }), 
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Require admin privileges
  if (locals.user.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }), 
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  return new Response(
    JSON.stringify({ 
      hasAdminKey: !!env.ADMIN_API_KEY,
      hasJWTSecret: !!env.JWT_SECRET,
      hasDB: !!env.DB,
      hasMediaBucket: !!env.MEDIA,
      hasChatDO: !!env.GLOBAL_CHAT,
      message: 'Environment check complete'
    }), 
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
