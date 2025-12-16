// Feed endpoint for the family blog
// This endpoint merges DB posts with markdown posts
// Note: Markdown posts are handled at build time by Astro, so we only return DB posts here
// The frontend can fetch markdown posts separately via /blog/* endpoints

export async function get(context) {
  try {
    const url = new URL(context.request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const cursor = parseInt(url.searchParams.get('cursor') || '0', 10);

    // Fetch DB posts
    const dbRows = await context.env.DB.prepare(
      'SELECT p.*, u.name, u.email FROM posts p JOIN users u ON p.user_id = u.id ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, cursor).all();
    
    const dbPosts = (dbRows.results || []).map(post => ({
      ...post,
      media_refs: post.media_refs ? JSON.parse(post.media_refs) : [],
      source: post.source || 'ui'
    }));

    // TODO: For now, markdown posts are served separately via /blog/* routes
    // Frontend can merge them client-side if needed
    // In the future, we could add a build-time process to inject markdown posts into D1

    return new Response(JSON.stringify({ 
      posts: dbPosts,
      nextCursor: dbPosts.length === limit ? cursor + limit : null
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Feed error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
