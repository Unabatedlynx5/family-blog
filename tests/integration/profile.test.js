
import { describe, it, expect, beforeEach } from 'vitest';
import { POST as updateProfile } from '../../src/pages/api/user/profile.ts';

describe('Profile API Integration', () => {
  let env;
  let mockLocals;

  beforeEach(() => {
    env = globalThis.testEnv;
    mockLocals = { runtime: { env } };
  });

  it('should update profile with valid data', async () => {
    // Setup user
    const userId = 'user-profile-' + Date.now();
    const now = Math.floor(Date.now() / 1000);
    
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)')
      .bind(userId, 'profile@test.com', 'hash', 'Old Name', 'user', now)
      .run();

    // Mock authenticated user
    const authenticatedLocals = {
      ...mockLocals,
      user: { sub: userId }
    };

    const request = new Request('http://localhost/api/user/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'New Name',
        birthday: '1990-01-01'
      })
    });

    const response = await updateProfile({ request, locals: authenticatedLocals });
    expect(response.status).toBe(200);

    // Verify DB update
    const user = await env.DB.prepare('SELECT name, birthday FROM users WHERE id = ?').bind(userId).first();
    expect(user.name).toBe('New Name');
    expect(user.birthday).toBe('1990-01-01');
  });

  it('should require authentication', async () => {
    const request = new Request('http://localhost/api/user/profile', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' })
    });

    // No user in locals
    const response = await updateProfile({ request, locals: mockLocals });
    expect(response.status).toBe(401);
  });

  it('should require name', async () => {
    const authenticatedLocals = {
      ...mockLocals,
      user: { sub: 'some-id' }
    };

    const request = new Request('http://localhost/api/user/profile', {
      method: 'POST',
      body: JSON.stringify({ birthday: '1990-01-01' })
    });

    const response = await updateProfile({ request, locals: authenticatedLocals });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBeDefined();
  });
});
