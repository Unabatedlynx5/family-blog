/**
 * User settings endpoint
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - Input validation using whitelist approach
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../types/cloudflare';
import { requireAuth } from '../../../workers/utils/validation.ts';

export const prerender = false;

/** User settings row */
interface UserSettingsRow {
  user_id: string;
  theme: string;
  notifications_enabled: number;
  language: string;
  updated_at: number;
}

/** Request body for updating settings */
interface UpdateSettingsBody {
  theme?: string;
  notifications_enabled?: boolean;
  language?: string;
}

// Valid options for whitelist validation
const VALID_THEMES = ['light', 'dark'] as const;
const VALID_LANGUAGES = ['en', 'es', 'fr', 'de'] as const;

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Check authentication
  const authError = requireAuth(locals.user);
  if (authError) return authError;

  const userId = locals.user!.sub;

  try {
    const settings = await env.DB.prepare(
      'SELECT * FROM user_settings WHERE user_id = ?'
    ).bind(userId).first<UserSettingsRow>();

    // Return default settings if none exist
    if (!settings) {
      return new Response(JSON.stringify({
        theme: 'light',
        notifications_enabled: 1,
        language: 'en'
      }), { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=300' // Cache for 5 minutes
        }
      });
    }

    return new Response(JSON.stringify(settings), { 
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=300' // Cache for 5 minutes
      }
    });
  } catch (err) {
    console.error('Settings fetch error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Check authentication
  const authError = requireAuth(locals.user);
  if (authError) return authError;

  const userId = locals.user!.sub;

  try {
    let body: UpdateSettingsBody;
    try {
      body = await request.json() as UpdateSettingsBody;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { theme, notifications_enabled, language } = body;

    // Security: Validate theme using whitelist
    const validatedTheme = (VALID_THEMES as readonly string[]).includes(theme || '') 
      ? theme 
      : 'light';

    // Security: Validate language using whitelist
    const validatedLanguage = (VALID_LANGUAGES as readonly string[]).includes(language || '') 
      ? language 
      : 'en';

    // Security: Validate notifications_enabled (boolean to int)
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
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
