import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as any;
  
  try {
    // Get pagination params
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // 1. Fetch Markdown posts
    const markdownPosts = await getCollection('blog');
    const formattedMarkdownPosts = markdownPosts.map(post => ({
      id: `md-${post.id}`,
      user_id: 'admin', // Historical posts assumed to be admin
      content: post.body, // Note: This is raw markdown. For rendered HTML, we'd need a different approach or render on client
      created_at: Math.floor(post.data.pubDate.getTime() / 1000),
      name: 'Family Blog', // Author name for historical posts
      email: '',
      source: 'markdown',
      title: post.data.title,
      slug: post.id,
      media_url: post.data.heroImage || null
    }));

    // 2. Fetch DB posts (fetch slightly more than limit to handle interleaving, or fetch all if dataset is small)
    // For a true merged pagination, we ideally need to query the DB with a limit, but since we are merging two sources,
    // the simplest robust way for a small-medium scale is to fetch a larger chunk or handle sorting in memory if possible.
    // However, to respect the "cursor" or "page" properly with two sources, we usually need to fetch 'limit' from BOTH, 
    // sort, take 'limit', and keep track of state. 
    // For this MVP, let's fetch the DB posts for the requested page, but we also need to account for where the markdown posts fall.
    
    // SIMPLIFIED STRATEGY for MVP:
    // Fetch ALL markdown posts (assuming < 100s)
    // Fetch DB posts with a generous limit or just standard pagination?
    // If we just paginate DB, the markdown posts might appear "on top" or "mixed in" incorrectly if we don't have a global view.
    
    // Better Strategy for MVP:
    // 1. Get all markdown posts.
    // 2. Get count of DB posts.
    // 3. Calculate total items.
    // 4. If offset < markdownPosts.length, we might need some markdown posts.
    // 5. This is getting complex for a simple feed.
    
    // ALTERNATIVE: Just return all markdown posts in the first request (page 1) or merge them all in memory if the total count is low.
    // Let's assume the user wants a single chronological feed.
    
    // Let's try to fetch a reasonable number of DB posts to mix in.
    // Since we can't easily "skip" X rows in DB based on how many markdown posts were before them without complex logic,
    // we will fetch the DB page as requested, and merge ALL markdown posts, then sort and slice the current page in memory.
    // This works well if the total number of posts (DB + MD) is not huge (e.g. < 1000).
    
    const dbResult = await env.DB.prepare(`
      SELECT 
        p.id,
        p.user_id,
        p.content,
        p.created_at,
        p.media_refs,
        u.name,
        u.email
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 1000
    `).all();

    const dbPosts = (dbResult.results || []).map((post: any) => {
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
        media_url,
        source: 'ui'
      };
    });

    // Merge and Sort
    const allPosts = [...formattedMarkdownPosts, ...dbPosts].sort((a, b) => b.created_at - a.created_at);
    
    // Paginate in memory
    const total = allPosts.length;
    const paginatedPosts = allPosts.slice(offset, offset + limit);

    return new Response(
      JSON.stringify({
        posts: paginatedPosts,
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
