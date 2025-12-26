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

  const userId = locals.user.sub;

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

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as any;
  
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const userId = locals.user.sub;

  try {
    const body = await request.json() as any;
    const { theme, notifications_enabled, language } = body;

    // Validate theme
    const validThemes = ['light', 'dark'];
    const validatedTheme = validThemes.includes(theme) ? theme : 'light';

    // Validate language
    const validLanguages = ['en', 'es', 'fr', 'de'];
    const validatedLanguage = validLanguages.includes(language) ? language : 'en';

    // Validate notifications_enabled (boolean)
    const validatedNotifications = notifications_enabled ? 1 : 0;

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
      validatedTheme,
      validatedNotifications,
      validatedLanguage,
      Date.now()
    ).run();

    return new Response(JSON.stringify({ success: true }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Settings update error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
