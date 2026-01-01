/**
 * Password reset endpoint
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - CRITICAL Issue #1: Rate limiting to prevent abuse
 * - Input validation for email and password
 */

import type { APIRoute } from 'astro';
import { randomUUID, createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import type { CloudflareEnv } from '../../../types/cloudflare';
import { CONFIG, isValidEmail } from '../../../types/cloudflare';
import { isRateLimited, getRateLimitInfo, createRateLimitResponse } from '../../../../workers/utils/rate-limit.ts';

export const prerender = false;

/** Request body for password reset */
interface ResetPasswordBody {
  email?: string;
  token?: string;
  password?: string;
}

/** Password reset token row */
interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  used: number;
  created_at: number;
}

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  let body: ResetPasswordBody;
  try {
    body = await request.json() as ResetPasswordBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { email, token, password } = body;

  // Case 1: Request Reset Link (Forgot Password)
  if (email) {
    // Security: Rate limiting - 3 requests per email per hour
    // Prevents email enumeration and abuse
    const rateLimitKey = `password-reset-request:${clientAddress || 'unknown'}:${email.toLowerCase()}`;
    if (isRateLimited(rateLimitKey, 3, 60 * 60 * 1000)) {
      const info = getRateLimitInfo(rateLimitKey, 3);
      return createRateLimitResponse(info, 'Too many password reset requests. Please try again later.');
    }
    
    // Security: Validate email format
    if (!isValidEmail(email)) {
      // Return 200 even for invalid email to prevent enumeration
      return new Response(JSON.stringify({ message: 'If an account exists with that email, a reset link has been sent.' }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const user = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND is_active = 1')
        .bind(email.toLowerCase().trim())
        .first<{ id: string }>();
        
      if (!user) {
        // Return 200 even if user not found to prevent enumeration
        return new Response(JSON.stringify({ message: 'If an account exists with that email, a reset link has been sent.' }), { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const resetToken = randomUUID();
      const tokenHash = createHash('sha256').update(resetToken).digest('hex');
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + 60 * 60; // 1 hour

      await env.DB.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(randomUUID(), user.id, tokenHash, expiresAt, now)
        .run();

      // In a real app, send email here.
      // For development only - DO NOT LOG TOKENS IN PRODUCTION
      if (env.ENVIRONMENT === 'development') {
        const resetLink = `${new URL(request.url).origin}/reset-password?token=${resetToken}`;
        console.log(`[DEV ONLY] Password reset link: ${resetLink}`);
      } else {
        console.log(`[Password Reset] Token generated for user ${user.id}`);
      }

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
    // Security: Rate limiting for token verification - 5 attempts per IP per 15 minutes
    // Prevents brute force attacks on reset tokens
    const rateLimitKey = `password-reset-verify:${clientAddress || 'unknown'}`;
    if (isRateLimited(rateLimitKey, 5, 15 * 60 * 1000)) {
      const info = getRateLimitInfo(rateLimitKey, 5);
      return createRateLimitResponse(info, 'Too many password reset attempts. Please try again later.');
    }
    
    // Security: Validate password length
    if (password.length < CONFIG.auth.passwordMinLength) {
       return new Response(JSON.stringify({ error: `Password must be at least ${CONFIG.auth.passwordMinLength} characters` }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const now = Math.floor(Date.now() / 1000);

      const record = await env.DB.prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used = 0 AND expires_at > ?')
        .bind(tokenHash, now)
        .first<PasswordResetTokenRow>();

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
