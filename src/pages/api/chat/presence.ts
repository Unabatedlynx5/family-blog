import type { APIRoute } from 'astro';
// @ts-ignore
import { verifyAccessToken } from '../../../../workers/utils/auth.js';

export const prerender = false;

// Update presence for the current user
export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const env = locals.runtime.env as any;

  // Verify authentication
  let token = cookies.get('accessToken')?.value;
  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const jwtSecret = await env.JWT_SECRET;
    const decoded = verifyAccessToken(token, { JWT_SECRET: jwtSecret });
    if (!decoded) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now, decoded.sub).run();

    return new Response(JSON.stringify({ ok: true, last_seen: now }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Presence update error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
