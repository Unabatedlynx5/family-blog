import type { APIRoute } from 'astro';
import { randomUUID, createHash } from 'crypto';
import bcrypt from 'bcryptjs';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as any;
  
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { email, token, password } = body as { email?: string; token?: string; password?: string };

  // Case 1: Request Reset Link (Forgot Password)
  if (email) {
    try {
      const user = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND is_active = 1')
        .bind(email)
        .first();
        
      if (!user) {
        // Return 200 even if user not found to prevent enumeration
        return new Response(JSON.stringify({ message: 'If an account exists with that email, a reset link has been sent.' }), { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const token = randomUUID();
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + 60 * 60; // 1 hour

      await env.DB.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(randomUUID(), user.id, tokenHash, expiresAt, now)
        .run();

      // In a real app, send email here.
      // For now, log the link.
      const resetLink = `${new URL(request.url).origin}/reset-password?token=${token}`;
      console.log(`[Password Reset] Link for ${email}: ${resetLink}`);

      return new Response(JSON.stringify({ message: 'If an account exists with that email, a reset link has been sent.' }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      console.error('Forgot password error:', err);
      return new Response(JSON.stringify({ error: 'Server error' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Case 2: Reset Password
  if (token && password) {
    if (password.length < 8) {
       return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const now = Math.floor(Date.now() / 1000);

      const record = await env.DB.prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used = 0 AND expires_at > ?')
        .bind(tokenHash, now)
        .first();

      if (!record) {
        return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      // Update user password
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .bind(passwordHash, record.user_id)
        .run();

      // Mark token as used
      await env.DB.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?')
        .bind(record.id)
        .run();

      return new Response(JSON.stringify({ message: 'Password reset successfully' }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      console.error('Reset password error:', err);
      return new Response(JSON.stringify({ error: 'Server error' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Invalid request. Provide email OR token+password.' }), { 
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
};
