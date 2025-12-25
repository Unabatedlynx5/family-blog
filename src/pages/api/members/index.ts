import type { APIRoute } from 'astro';

export const prerender = false;

// Return active members count (last_seen within past 2 minutes)
export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as any;
  try {
    const twoMinutesAgo = Math.floor(Date.now() / 1000) - 120;
    const row = await env.DB.prepare('SELECT COUNT(*) as active FROM users WHERE last_seen IS NOT NULL AND last_seen > ?').bind(twoMinutesAgo).first();
    const active = row?.active || 0;
    return new Response(JSON.stringify({ active }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Members fetch error:', err);
    return new Response(JSON.stringify({ error: 'Server error', active: 0 }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
