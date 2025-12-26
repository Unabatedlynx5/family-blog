import type { APIRoute } from 'astro';

export const prerender = false;

// Return active members count (last_seen within past 2 minutes)
export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as any;
  try {
    const twoMinutesAgo = Math.floor(Date.now() / 1000) - 120;
    const countRow = await env.DB.prepare('SELECT COUNT(*) as active FROM users WHERE last_seen IS NOT NULL AND last_seen > ?').bind(twoMinutesAgo).first();
    const active = countRow?.active || 0;

    const rows = await env.DB.prepare('SELECT id, name, avatar_url, last_seen FROM users WHERE last_seen IS NOT NULL AND last_seen > ? ORDER BY last_seen DESC LIMIT 100').bind(twoMinutesAgo).all();
    const members = (rows.results || []).map((r: any) => ({ id: r.id, name: r.name, avatar_url: r.avatar_url, last_seen: r.last_seen }));

    return new Response(JSON.stringify({ active, members }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Members fetch error:', err);
    return new Response(JSON.stringify({ error: 'Server error', active: 0, members: [] }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
