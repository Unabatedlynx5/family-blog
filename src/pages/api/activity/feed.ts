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
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    // Fetch events
    const eventsMsg = await env.DB.prepare(`
      SELECT e.id, e.created_at, e.user_id, u.name as user_name, u.avatar_url as user_avatar
      FROM upload_events e
      JOIN users u ON e.user_id = u.id
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const events = eventsMsg.results;
    
    // Fetch preview photos for these events
    if (events.length > 0) {
      const eventIds = events.map((e: any) => `'${e.id}'`).join(',');
      const photosMsg = await env.DB.prepare(`
        SELECT id, event_id, width, height
        FROM photos 
        WHERE event_id IN (${eventIds})
      `).all(); // We fetch all to select locally or use a window function in SQL if supported

      const photosByEvent: Record<string, any[]> = {};
      photosMsg.results.forEach((p: any) => {
        if (!photosByEvent[p.event_id]) photosByEvent[p.event_id] = [];
        if (photosByEvent[p.event_id].length < 4) { // Only keep first 4 for preview
             photosByEvent[p.event_id].push({
                 id: p.id,
                 url: `/api/media/${p.id}`,
                 width: p.width,
                 height: p.height
             });
        }
      });

      // Attach photos to events
      events.forEach((e: any) => {
        e.photos = photosByEvent[e.id] || [];
      });
    } else {
        events.forEach((e: any) => e.photos = []);
    }

    return new Response(JSON.stringify({ 
      events,
      pagination: { page, limit, hasMore: events.length === limit }
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Activity Feed error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
