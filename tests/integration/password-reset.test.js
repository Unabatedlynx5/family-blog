
import { describe, it, expect, beforeEach } from 'vitest';
import { POST as handleResetPassword } from '../../src/pages/api/auth/reset-password.ts';
import { POST as createUser } from '../../src/pages/api/admin/users.ts';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';

describe('Password Reset Integration', () => {
  let env;
  let mockLocals;

  beforeEach(() => {
    env = globalThis.testEnv;
    mockLocals = { runtime: { env } };
  });

  it('should create a reset token when requesting password reset', async () => {
    // 1. Create a user
    const userId = 'user-reset-test-' + Date.now();
    const email = `reset-${Date.now()}@example.com`;
    const now = Math.floor(Date.now() / 1000);
    const passwordHash = await bcrypt.hash('oldpassword', 10);
    
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)')
      .bind(userId, email, passwordHash, 'Test User', 'user', now)
      .run();

    // 2. Request reset link
    const req = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });

    const res = await handleResetPassword({ request: req, locals: mockLocals });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toContain('reset link has been sent');

    // 3. Verify token in DB
    const tokenRecord = await env.DB.prepare('SELECT * FROM password_reset_tokens WHERE user_id = ?').bind(userId).first();
    expect(tokenRecord).toBeDefined();
    expect(tokenRecord.used).toBe(0);
  });

  it('should reset password with manually inserted token', async () => {
    // 1. Create a user
    const userId = 'user-reset-verify-' + Date.now();
    const email = `reset-verify-${Date.now()}@example.com`;
    const now = Math.floor(Date.now() / 1000);
    const passwordHash = await bcrypt.hash('oldpassword', 10);
    
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)')
      .bind(userId, email, passwordHash, 'Test User', 'user', now)
      .run();

    // 2. Insert a known token
    const token = 'my-secret-token';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = now + 3600;
    const tokenId = crypto.randomUUID();
    
    await env.DB.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenId, userId, tokenHash, expiresAt, now)
      .run();

    // 3. Reset password
    const req = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: token, password: 'newpassword123' })
    });

    const res = await handleResetPassword({ request: req, locals: mockLocals });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe('Password reset successfully');

    // 4. Verify new password works
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    const match = await bcrypt.compare('newpassword123', user.password_hash);
    expect(match).toBe(true);

    // 5. Verify token is marked used
    const tokenRecord = await env.DB.prepare('SELECT * FROM password_reset_tokens WHERE id = ?').bind(tokenId).first();
    expect(tokenRecord.used).toBe(1);
  });
});
