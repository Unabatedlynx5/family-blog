import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST as createUser } from '../src/pages/api/admin/users';
import { POST as login } from '../src/pages/api/auth/login';
import { applyMigrations } from './utils/db';
import { setupMiniflare } from './utils/miniflare';

describe('Authentication Tests', () => {
  let mf;
  let env;
  let mockLocals;

  beforeEach(async () => {
    const setup = await setupMiniflare();
    mf = setup.mf;
    env = setup.env;
    
    await applyMigrations(env.DB);
    
    mockLocals = {
      runtime: { env }
    };
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it('should create a user when authenticated as admin', async () => {
    // Mock logged-in admin user
    mockLocals.user = {
      sub: 'admin-id',
      email: 'admin@familyblog.com',
      name: 'Super Admin',
      role: 'admin'
    };

    const req = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User'
      })
    });

    const res = await createUser({ request: req, locals: mockLocals });
    expect(res.status).toBe(201);
    
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.ok).toBe(true);

    // Verify in DB
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind('newuser@example.com').first();
    expect(user).toBeDefined();
    expect(user.name).toBe('New User');
  });

  it('should fail to create user without admin privileges', async () => {
    // Mock non-admin user
    mockLocals.user = {
      sub: 'user-id',
      email: 'user@example.com',
      name: 'Regular User'
    };

    const req = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'hacker@example.com',
        password: 'password123'
      })
    });

    const res = await createUser({ request: req, locals: mockLocals });
    expect(res.status).toBe(403);
  });

  it('should fail to create user when not logged in', async () => {
    // No user in locals
    mockLocals.user = null;

    const req = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'hacker@example.com',
        password: 'password123'
      })
    });

    const res = await createUser({ request: req, locals: mockLocals });
    expect(res.status).toBe(401);
  });

  it('should login successfully', async () => {
    // First create a user (manually to skip API overhead)
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('password123', 10);
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('user-123', 'user@example.com', hash, 'Test User', 1, Date.now())
      .run();

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'password123'
      })
    });

    // Mock cookies object
    const cookies = {
      set: vi.fn()
    };

    const res = await login({ request: req, locals: mockLocals, cookies });
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.accessToken).toBeDefined();
    expect(data.user.email).toBe('user@example.com');
    expect(data.user.name).toBe('Test User');
    
    // Check if refresh token cookie was set
    expect(cookies.set).toHaveBeenCalled();
    const calls = cookies.set.mock.calls;
    const refreshCall = calls.find(call => call[0] === 'refresh');
    expect(refreshCall).toBeDefined();
    expect(refreshCall[2]).toMatchObject({ httpOnly: true });
  });

  it('should fail login with wrong password', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('password123', 10);
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('user-123', 'user@example.com', hash, 'Test User', 1, Date.now())
      .run();

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'wrongpassword'
      })
    });

    const res = await login({ request: req, locals: mockLocals, cookies: { set: vi.fn() } });
    expect(res.status).toBe(401);
  });
});
