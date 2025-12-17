import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env as any;
  const postId = params.id;

  if (!postId) {
    return new Response(JSON.stringify({ error: 'Post ID required' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const post = await env.DB.prepare(`
      SELECT 
        p.id,
        p.user_id,
        p.content,
        p.media_refs,
        p.created_at,
        u.name,
        u.email
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).bind(postId).first();

    if (!post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const mediaRefs = (() => {
      try {
        return post.media_refs ? JSON.parse(post.media_refs) : [];
      } catch (_e) {
        return [];
      }
    })();

    const media_urls = Array.isArray(mediaRefs)
      ? mediaRefs.map((id: string) => `/api/media/${id}`)
      : [];

    delete post.media_refs;

    return new Response(
      JSON.stringify({ post: { ...post, media_urls } }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Get post error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
