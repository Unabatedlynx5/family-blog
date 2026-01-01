/**
 * User profile update endpoint
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - Input validation for name and birthday
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../../types/cloudflare';
import { requireAuth } from '../../../../workers/utils/validation.ts';

export const prerender = false;

/** Request body for profile update */
interface ProfileUpdateBody {
  name?: string;
  birthday?: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Check authentication
  const authError = requireAuth(locals.user);
  if (authError) return authError;

  const userId = locals.user!.sub;

  try {
    let body: ProfileUpdateBody;
    try {
      body = await request.json() as ProfileUpdateBody;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { name, birthday } = body;

    // Validate name
    if (!name || typeof name !== 'string') {
        return new Response(JSON.stringify({ error: 'Name is required' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
        return new Response(JSON.stringify({ error: 'Name cannot be empty' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    if (trimmedName.length > 100) {
        return new Response(JSON.stringify({ error: 'Name must be 100 characters or less' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    // Validate birthday format if provided (YYYY-MM-DD)
    let validatedBirthday: string | null = null;
    if (birthday) {
      if (typeof birthday !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid birthday format' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // Validate YYYY-MM-DD format
      const birthdayRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!birthdayRegex.test(birthday)) {
        return new Response(JSON.stringify({ error: 'Birthday must be in YYYY-MM-DD format' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      validatedBirthday = birthday;
    }

    // Update user profile
    await env.DB.prepare(`
      UPDATE users 
      SET name = ?, birthday = ?
      WHERE id = ?
    `)
    .bind(trimmedName, validatedBirthday, userId)
    .run();

    return new Response(JSON.stringify({ ok: true }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Profile update error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
