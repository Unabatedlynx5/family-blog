export async function get(context) {
  try {
    // list posts from DB
    const limit = parseInt(new URL(context.request.url).searchParams.get('limit') || '20', 10);
    const rows = await context.env.DB.prepare('SELECT p.*, u.name FROM posts p JOIN users u ON p.user_id = u.id ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    return new Response(JSON.stringify({ posts: rows.results || [] }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Get posts error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

import { verifyAccessToken } from '../../../workers/utils/auth.js';

export async function post(context) {
  const req = context.request;
  
  try {
    const body = await req.json();
    const { content, media_refs } = body;
    const auth = req.headers.get('authorization') || '';
    const match = auth.match(/Bearer\s+(.+)/);
    if (!match) return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
    const token = match[1];
    const payload = verifyAccessToken(token, context.env);
    if (!payload) return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
    const userId = payload.sub || payload.id;
    const now = Math.floor(Date.now() / 1000);
    const postId = crypto.randomUUID();
    await context.env.DB.prepare('INSERT INTO posts (id, user_id, content, media_refs, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(postId, userId, content || '', JSON.stringify(media_refs || []), now)
      .run();
    return new Response(JSON.stringify({ ok: true, id: postId }), { 
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Create post error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
