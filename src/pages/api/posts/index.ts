import type { APIRoute } from 'astro';
// @ts-ignore
import { verifyAccessToken } from '../../../../workers/utils/auth.js';

export const prerender = false;

// List posts
export const GET: APIRoute = async ({ request, locals, url }) => {
  const env = locals.runtime.env as any;
  
  // Pagination
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  try {
    const posts = await env.DB.prepare(`
      SELECT * FROM posts 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `)
    .bind(limit, offset)
    .all();
    
    const count = await env.DB.prepare('SELECT COUNT(*) as count FROM posts').first();
    
    return new Response(JSON.stringify({
      posts: posts.results,
      pagination: {
        page,
        limit,
        total: count.count,
        totalPages: Math.ceil(count.count / limit)
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('Get posts error:', e);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};

// Create a new post
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as any;
  
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { content, media_id } = body as { content: string; media_id?: string };
    
    if (!content || content.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Content cannot be empty' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If media_id provided, verify it exists and belongs to user
    if (media_id) {
      const media = await env.DB.prepare(
        'SELECT id FROM media WHERE id = ? AND uploader_id = ?'
      ).bind(media_id, locals.user!.sub).first();
      
      if (!media) {
        return new Response(JSON.stringify({ error: 'Invalid media ID' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Create post
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const mediaRefs = media_id ? JSON.stringify([media_id]) : null;
    
    await env.DB.prepare(
      'INSERT INTO posts (id, user_id, content, media_refs, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(id, locals.user!.sub, content.trim(), mediaRefs, now)
      .run();

    return new Response(
      JSON.stringify({ 
        ok: true,
        post: {
          id,
          user_id: locals.user!.sub,
          content: content.trim(),
          media_refs: mediaRefs,
          created_at: now
        }
      }), 
      { 
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Post creation error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
