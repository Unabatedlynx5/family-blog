import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as any;
  
  try {
    // Get pagination params
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await env.DB.prepare('SELECT COUNT(*) as total FROM posts').first();
    const total = countResult?.total || 0;

    // Get posts with media
    const result = await env.DB.prepare(`
      SELECT 
        p.id,
        p.user_id,
        p.content,
        p.created_at,
        u.name,
        u.email,
        m.id as media_id,
        m.filename as media_filename,
        m.content_type as media_type
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN media m ON p.media_id = m.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const posts = result.results || [];

    // Add R2 URLs for media
    const postsWithMedia = posts.map((post: any) => {
      if (post.media_id) {
        // Generate R2 URL
        post.media_url = `/api/media/${post.media_id}`;
      }
      return post;
    });

    return new Response(
      JSON.stringify({
        posts: postsWithMedia,
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
