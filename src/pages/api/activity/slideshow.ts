import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as any;
  
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Determine shuffle/random. 
    // Ideally use SQL `ORDER BY RANDOM()` but D1 might be slow with large sets? 
    // It's standard SQLite so OK for thousands.
    const photosMsg = await env.DB.prepare(`
        SELECT p.id, p.width, p.height, p.created_at, u.name as user_name
        FROM photos p
        JOIN users u ON p.user_id = u.id
        ORDER BY RANDOM()
        LIMIT 500
    `).all(); // Limit 500 for now to prevent massive payloads. We can add pagination later.

    const photos = photosMsg.results.map((p: any) => ({
        id: p.id,
        url: `/api/media/${p.id}`,
        width: p.width,
        height: p.height,
        user_name: p.user_name,
        created_at: p.created_at
    }));

    return new Response(JSON.stringify({ photos }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Slideshow error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
