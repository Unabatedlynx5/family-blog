import type { APIRoute } from 'astro';
// @ts-ignore
import { verifyAccessToken } from '../../../../workers/utils/auth.js';

export const prerender = false;

// Get recent messages
export const GET: APIRoute = async ({ request, locals, cookies }) => {
  const env = locals.runtime.env as any;
  
  // Verify authentication
  let token = cookies.get('accessToken')?.value;
  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const jwtSecret = await env.JWT_SECRET;
    const decoded = verifyAccessToken(token, { JWT_SECRET: jwtSecret });
    if (!decoded) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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
    `).all();

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
export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const env = locals.runtime.env as any;
  
  // Verify authentication
  let token = cookies.get('accessToken')?.value;
  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const jwtSecret = await env.JWT_SECRET;
    const decoded = verifyAccessToken(token, { JWT_SECRET: jwtSecret });
    if (!decoded) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { message } = body as { message: string };
    if (!message || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Message cannot be empty' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user info
    const user = await env.DB.prepare('SELECT id, name, email FROM users WHERE id = ?')
      .bind(decoded.sub)
      .first();

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
      .bind(id, user.id, user.name, user.email, message.trim(), now)
      .run();

    return new Response(
      JSON.stringify({ 
        ok: true,
        message: {
          id,
          user_id: user.id,
          user_name: user.name,
          user_email: user.email,
          message: message.trim(),
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
