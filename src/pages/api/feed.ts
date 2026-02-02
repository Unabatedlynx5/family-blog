import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as any;
  
  try {
    // Get pagination params
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const currentUserId = locals.user?.sub || '';

    const dbResult = await env.DB.prepare(`
      SELECT 
        p.id,
        p.user_id,
        p.content,
        p.created_at,
        p.media_refs,
        p.likes,
        u.name,
        u.email,
        u.avatar_url
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const dbCountRow = await env.DB.prepare('SELECT COUNT(*) as count FROM posts').first();
    const total = dbCountRow?.count || 0;

    const posts = (dbResult.results || []).map((post: any) => {
      // Parse likes
      let like_count = 0;
      let user_has_liked = 0;
      try {
        const likesArray = JSON.parse(post.likes || '[]');
        if (Array.isArray(likesArray)) {
          like_count = likesArray.length;
          if (currentUserId && likesArray.includes(currentUserId)) {
            user_has_liked = 1;
          }
        }
      } catch (e) {
        // ignore parse error
      }

      // If we have media_refs, we might want to resolve them to URLs or just pass them through.
      // For now, let's just pass them through or pick the first one if the UI expects a single media_url.
      let media_url = null;
      if (post.media_refs) {
        try {
            const refs = JSON.parse(post.media_refs);
            if (Array.isArray(refs) && refs.length > 0) {
                media_url = `/api/media/${refs[0]}`;
            }
        } catch (e) {
            // ignore parse error
        }
      }
      
      return {
        ...post,
        like_count,
        user_has_liked,
        media_url,
        source: 'ui'
      };
    });

    return new Response(
      JSON.stringify({
        posts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: offset + limit < total
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Feed error:', err);
    return new Response(
      JSON.stringify({ error: 'Server error', posts: [] }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

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

  // @ts-ignore
  const { verifyAccessToken } = await import('../../../workers/utils/auth.js');
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
    const { content, media_id } = body;

    if (!content && !media_id) {
      return new Response(JSON.stringify({ error: 'Content or media required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    // The schema has media_refs (JSON array), not media_id.
    // We need to adapt the insert to match the schema.
    // If media_id is provided, we'll wrap it in a JSON array.
    const mediaRefs = media_id ? JSON.stringify([media_id]) : null;

    await env.DB.prepare(
      'INSERT INTO posts (id, user_id, content, media_refs, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(id, decoded.sub, content || '', mediaRefs, now)
      .run();

    return new Response(
      JSON.stringify({ 
        ok: true,
        post: {
          id,
          user_id: decoded.sub,
          content,
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
    console.error('Post error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
