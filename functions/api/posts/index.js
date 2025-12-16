export async function get(context) {
  // list posts from DB
  const limit = parseInt(new URL(context.request.url).searchParams.get('limit') || '20', 10);
  const rows = await context.env.DB.prepare('SELECT p.*, u.name FROM posts p JOIN users u ON p.user_id = u.id ORDER BY created_at DESC LIMIT ?').bind(limit).all();
  return new Response(JSON.stringify({ posts: rows.results }), { status: 200 });
}

import { verifyAccessToken } from '../../../workers/utils/auth.js';

export async function post(context) {
  const req = context.request;
  const body = await req.json();
  const { content, media_refs } = body;
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/Bearer\s+(.+)/);
  if (!match) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const token = match[1];
  const payload = verifyAccessToken(token);
  if (!payload) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const userId = payload.sub || payload.sub || payload.id;
  const now = Math.floor(Date.now() / 1000);
  await context.env.DB.prepare('INSERT INTO posts (id, user_id, content, media_refs, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, content || '', JSON.stringify(media_refs || []), now)
    .run();
  return new Response(JSON.stringify({ ok: true }), { status: 201 });
}
