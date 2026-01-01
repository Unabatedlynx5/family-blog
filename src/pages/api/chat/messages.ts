/**
 * Chat messages endpoint
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - Use middleware auth instead of manual token verification
 * - Rate limiting for message sending
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../../types/cloudflare';
import { CONFIG } from '../../../types/cloudflare';
import { requireAuth } from '../../../../workers/utils/validation.ts';
import { isRateLimited, getRateLimitInfo, createRateLimitResponse } from '../../../../workers/utils/rate-limit.ts';

export const prerender = false;

/** Chat message row from database */
interface ChatMessageRow {
  id: string;
  user_id: string;
  user: string;
  user_email: string;
  text: string;
  created_at: number;
  avatar_url: string | null;
}

/** Request body for sending a message */
interface SendMessageBody {
  message: string;
}

/** User row for message sending */
interface MessageUserRow {
  id: string;
  name: string;
  email: string;
}

// Get recent messages
export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Check authentication via middleware
  const authError = requireAuth(locals.user);
  if (authError) return authError;

  try {
    // Get last 50 messages
    const result = await env.DB.prepare(`
      SELECT 
        m.id, 
        m.user_id, 
        m.user_name as user, 
        m.user_email, 
        m.message as text, 
        m.created_at,
        u.avatar_url
      FROM chat_messages m
      LEFT JOIN users u ON m.user_id = u.id
      ORDER BY m.created_at DESC 
      LIMIT 50
    `).all<ChatMessageRow>();

    const messages = (result.results || []).reverse(); // Show oldest first

    return new Response(
      JSON.stringify({ messages }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Chat fetch error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Send a message
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Check authentication via middleware
  const authError = requireAuth(locals.user);
  if (authError) return authError;

  const userId = locals.user!.sub;
  
  // Security: Rate limiting - 60 messages per minute per user
  const rateLimitKey = `chat:${userId}`;
  if (isRateLimited(rateLimitKey, 60, 60 * 1000)) {
    const info = getRateLimitInfo(rateLimitKey, 60);
    return createRateLimitResponse(info, 'Message rate limit reached. Please slow down.');
  }

  try {
    let body: SendMessageBody;
    try {
      body = await request.json() as SendMessageBody;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { message } = body;
    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message must be a string' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const trimmedMessage = message.trim();
    
    if (trimmedMessage.length === 0) {
      return new Response(JSON.stringify({ error: 'Message cannot be empty' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Prevent excessively long messages (max 5000 chars)
    if (trimmedMessage.length > 5000) {
      return new Response(JSON.stringify({ error: 'Message too long (max 5000 characters)' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user info
    const user = await env.DB.prepare('SELECT id, name, email FROM users WHERE id = ?')
      .bind(userId)
      .first<MessageUserRow>();

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Insert message
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    
    await env.DB.prepare(
      'INSERT INTO chat_messages (id, user_id, user_name, user_email, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(id, user.id, user.name, user.email, trimmedMessage, now)
      .run();

    return new Response(
      JSON.stringify({ 
        ok: true,
        message: {
          id,
          user_id: user.id,
          user_name: user.name,
          user_email: user.email,
          message: trimmedMessage,
          created_at: now
        }
      }), 
      { 
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Chat send error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
