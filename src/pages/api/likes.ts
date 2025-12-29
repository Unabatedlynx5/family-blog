import type { APIRoute } from 'astro';
// @ts-ignore
import { verifyAccessToken } from '../../../workers/utils/auth.js';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const env = locals.runtime.env as any;
  
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
    const { target_id, target_type } = body;

    if (!target_id || !target_type) {
      return new Response(JSON.stringify({ error: 'Target ID and type required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const allowedTypes = ['post']; // Only posts for now
    if (!allowedTypes.includes(target_type)) {
      return new Response(JSON.stringify({ error: 'Invalid target type' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch current likes array
    const post = await env.DB.prepare('SELECT likes FROM posts WHERE id = ?').bind(target_id).first();
    
    if (!post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let likesArray: string[] = [];
    try {
      likesArray = JSON.parse(post.likes || '[]');
      if (!Array.isArray(likesArray)) likesArray = [];
    } catch (e) {
      likesArray = [];
    }

    const userId = typeof decoded === 'object' ? decoded.sub : undefined;
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Invalid token payload' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const index = likesArray.indexOf(userId);
    let liked = false;

    if (index > -1) {
      // Unlike: Remove user ID
      likesArray.splice(index, 1);
      liked = false;
    } else {
      // Like: Add user ID
      likesArray.push(userId);
      liked = true;
    }

    const newLikesJson = JSON.stringify(likesArray);
    const newCount = likesArray.length;

    // Update DB
    await env.DB.prepare('UPDATE posts SET likes = ? WHERE id = ?')
      .bind(newLikesJson, target_id)
      .run();

    // Notify Durable Object (Global Feed Room)
    try {
      // We use a single "FEED" room to broadcast updates for all posts
      const doId = env.POST_ROOM.idFromName('FEED');
      const stub = env.POST_ROOM.get(doId);
      
      // Fire and forget
      stub.fetch('http://internal/update', {
        method: 'POST',
        body: JSON.stringify({
          type: 'LIKE_UPDATE',
          postId: target_id,
          count: newCount
        })
      });
    } catch (e) {
      console.error('Failed to notify DO:', e);
    }

    return new Response(JSON.stringify({ liked, count: newCount }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Like error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
