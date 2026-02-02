import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, url }) => {
  const env = locals.runtime.env as any;
  
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Filter for images only
    const whereClause = "mime_type LIKE 'image/%'";

    const mediaItems = await env.DB.prepare(`
      SELECT m.*, u.name as uploader_name 
      FROM media m
      LEFT JOIN users u ON m.uploader_id = u.id
      WHERE ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .bind(limit, offset)
    .all();

    const count = await env.DB.prepare(`SELECT COUNT(*) as count FROM media WHERE ${whereClause}`).first();
    const total = count.count;

    const items = mediaItems.results.map((item: any) => ({
      id: item.id,
      url: `/api/media/${item.id}`,
      thumbnail_url: `/api/media/${item.id}`, // In future could be resized
      aspect_ratio: 1, // We don't store dimensions, so frontend will have to handle this or we presume square/variable
      type: 'image',
      created_at: item.created_at,
      uploader: {
        id: item.uploader_id,
        name: item.uploader_name
      }
    }));

    return new Response(JSON.stringify({
      media: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Gallery error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
