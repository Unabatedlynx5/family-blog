/**
 * Admin user delete endpoint
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - UUID validation for user ID
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../../../types/cloudflare';
import { isValidUUID } from '../../../../types/cloudflare';
import { requireAdmin } from '../../../../../workers/utils/validation';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  const { id } = params;

  // Security: Check admin privileges
  const authError = requireAdmin(locals.user);
  if (authError) return authError;

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing user ID' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Security: Validate UUID format
  if (!isValidUUID(id)) {
    return new Response(JSON.stringify({ error: 'Invalid user ID format' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Prevent deleting self
  if (id === locals.user!.sub) {
    return new Response(JSON.stringify({ error: 'Cannot delete yourself' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Manual cascade delete since D1/SQLite might not have ON DELETE CASCADE configured
    // 1. Delete refresh tokens
    await env.DB.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').bind(id).run();
    
    // 2. Delete posts (or could reassign to admin/system)
    // For now, let's delete them to be clean
    await env.DB.prepare('DELETE FROM posts WHERE user_id = ?').bind(id).run();
    
    // 3. Delete media records (Note: R2 files remain, ideally should be cleaned up too but that's a bigger task)
    await env.DB.prepare('DELETE FROM media WHERE uploader_id = ?').bind(id).run();

    // 4. Delete user
    const result = await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();

    if (result.meta.changes === 0) {
       return new Response(JSON.stringify({ error: 'User not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Delete user error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
