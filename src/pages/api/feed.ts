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
        u.name,
        u.email,
        m.id as media_id,
        m.filename as media_filename,
        m.content_type as media_type
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN media m ON p.media_id = m.id
      ORDER BY p.created_at DESC
      LIMIT 1000 -- Fetching a large batch to merge in memory for MVP
    `).all();

    const dbPosts = (dbResult.results || []).map((post: any) => {
      if (post.media_id) {
        post.media_url = `/api/media/${post.media_id}`;
      }
      return {
        ...post,
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
