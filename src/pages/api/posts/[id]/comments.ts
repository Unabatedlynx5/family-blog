import type { APIRoute } from 'astro';
// @ts-ignore
import { verifyAccessToken } from '../../../../../workers/utils/auth.js';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals, request }) => {
  const env = locals.runtime.env as any;
  const { id } = params;

  if (!id) {
    return new Response(JSON.stringify({ error: 'Post ID required' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const currentUserId = locals.user?.sub || '';

    const comments = await env.DB.prepare(`
      SELECT 
        c.id,
        c.post_id,
        c.content,
        c.created_at,
        u.id as user_id,
        u.name,
        u.avatar_url,
        (SELECT COUNT(*) FROM likes WHERE target_id = c.id AND target_type = 'comment') as like_count,
        (SELECT COUNT(*) FROM likes WHERE target_id = c.id AND target_type = 'comment' AND user_id = ?) as user_has_liked
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `).bind(currentUserId, id).all();

    return new Response(JSON.stringify({ comments: comments.results }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Error fetching comments:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ params, request, locals, cookies }) => {
  const env = locals.runtime.env as any;
  const { id: postId } = params;

  if (!postId) {
    return new Response(JSON.stringify({ error: 'Post ID required' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Verify authentication
  let token = cookies.get('accessToken')?.value;
  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const jwtSecret = await env.JWT_SECRET;
  const decoded = verifyAccessToken(token, { JWT_SECRET: jwtSecret });
  
  if (!decoded) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json() as any;
    const { content } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Content is required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const commentId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      'INSERT INTO comments (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(commentId, postId, decoded.sub, content.trim(), now)
      .run();

    // Fetch the created comment with user info to return
    const newComment = await env.DB.prepare(`
      SELECT 
        c.id,
        c.post_id,
        c.content,
        c.created_at,
        u.id as user_id,
        u.name,
        u.avatar_url
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).bind(commentId).first();

    // Notify Durable Object
    try {
      const doId = env.POST_ROOM.idFromName(postId);
      const stub = env.POST_ROOM.get(doId);
      
      stub.fetch('http://internal/update', {
        method: 'POST',
        body: JSON.stringify({
          type: 'NEW_COMMENT',
          comment: {
            ...newComment,
            like_count: 0,
            user_has_liked: 0
          }
        })
      });
    } catch (e) {
      console.error('Failed to notify DO:', e);
    }

    return new Response(JSON.stringify({ comment: newComment }), { 
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Error creating comment:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
