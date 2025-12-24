import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals, cookies, request }) => {
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
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Decode token to get user ID
  let userId;
  try {
    const parts = token.split('.');
    const payload = JSON.parse(atob(parts[1]));
    userId = payload.sub;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
  }

  try {
    const settings = await env.DB.prepare(
      'SELECT * FROM user_settings WHERE user_id = ?'
    ).bind(userId).first();

    // Return default settings if none exist
    if (!settings) {
      return new Response(JSON.stringify({
        theme: 'light',
        notifications_enabled: 1,
        language: 'en'
      }), { 
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=300' // Cache for 5 minutes
        }
      });
    }

    return new Response(JSON.stringify(settings), { 
      status: 200,
      headers: {
        'Cache-Control': 'private, max-age=300' // Cache for 5 minutes
      }
    });
  } catch (err) {
    console.error('Settings fetch error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
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
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Decode token to get user ID
  let userId;
  try {
    const parts = token.split('.');
    const payload = JSON.parse(atob(parts[1]));
    userId = payload.sub;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
  }

  try {
    const body = await request.json() as any;
    const { theme, notifications_enabled, language } = body;

    // Upsert settings
    await env.DB.prepare(`
      INSERT INTO user_settings (user_id, theme, notifications_enabled, language, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        theme = excluded.theme,
        notifications_enabled = excluded.notifications_enabled,
        language = excluded.language,
        updated_at = excluded.updated_at
    `).bind(
      userId,
      theme || 'light',
      notifications_enabled ? 1 : 0,
      language || 'en',
      Date.now()
    ).run();

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('Settings update error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
