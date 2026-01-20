
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST as login } from '../../src/pages/api/auth/login.ts';
import { POST as createPost } from '../../src/pages/api/posts/index.ts';
import { GET as getFeed } from '../../src/pages/api/feed.ts';
import { POST as refresh } from '../../src/pages/api/auth/refresh.ts';
import { POST as logout } from '../../src/pages/api/auth/logout.ts';
import bcrypt from 'bcryptjs';

// Mock astro:content
vi.mock('astro:content', () => ({
  getCollection: vi.fn().mockResolvedValue([])
}));

describe('Integration Flow', () => {
  let env;
  let mockLocals;

  beforeEach(async () => {
    env = globalThis.testEnv;
    mockLocals = { runtime: { env } };

    // Create user
    const hash = await bcrypt.hash('password123', 10);
    const userId = 'user-flow-' + Date.now();
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(userId, 'flow@example.com', hash, 'Flow User', 1, Math.floor(Date.now() / 1000))
      .run();
  });

  it('should allow user to login, create post, and see it in feed', async () => {
    // 1. Login
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'flow@example.com', password: 'password123' })
    });
    
    // Cookie store mock
    const cookieStore = new Map();
    const cookies = {
      set: (name, value) => cookieStore.set(name, value),
      get: (name) => cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined,
      delete: (name) => cookieStore.delete(name)
    };
    
    const loginRes = await login({ request: loginReq, locals: mockLocals, cookies, clientAddress: '127.0.0.1' });
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    const token = loginData.accessToken;
    expect(token).toBeDefined();

    // Authenticated locals
    const authLocals = {
        ...mockLocals,
        user: {
            sub: loginData.user.id,
            email: loginData.user.email,
            name: loginData.user.name,
            role: loginData.user.role
        }
    };

    // 2. Create Post
    const postReq = new Request('http://localhost/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Integration Test Post' })
    });
    
    const postRes = await createPost({ request: postReq, locals: authLocals, cookies });
    expect(postRes.status).toBe(201);
    const postData = await postRes.json();
    expect(postData.post.content).toBe('Integration Test Post');

    // 3. Get Feed
    // Note: getFeed uses getCollection from astro:content which returns []
    // So it should only return the DB post
    const feedReq = new Request('http://localhost/api/feed');
    const feedUrl = new URL('http://localhost/api/feed');
    
    // locals needs user info? The feed endpoint uses local.user.sub to check likes
    const feedLocals = { ...authLocals };
    
    const feedRes = await getFeed({ request: feedReq, locals: feedLocals, url: feedUrl });
    expect(feedRes.status).toBe(200);
    const feedData = await feedRes.json();
    
    expect(feedData.posts.length).toBeGreaterThan(0);
    const post = feedData.posts.find(p => p.content === 'Integration Test Post');
    expect(post).toBeDefined();
    expect(post.name).toBe('Flow User');
  });

  it('should handle full auth flow: login -> refresh -> logout', async () => {
    // 1. Login
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'flow@example.com', password: 'password123' })
    });
    
    const cookieStore = new Map();
    const cookies = {
      set: (name, value, opts) => cookieStore.set(name, value),
      get: (name) => cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined,
      delete: (name) => cookieStore.delete(name)
    };

    const loginRes = await login({ request: loginReq, locals: mockLocals, cookies, clientAddress: '127.0.0.1' });
    expect(loginRes.status).toBe(200);
    expect(cookieStore.has('accessToken')).toBe(true);
    expect(cookieStore.has('refresh')).toBe(true);
    
    const oldRefresh = cookieStore.get('refresh');

    // 2. Refresh
    const refreshReq = new Request('http://localhost/api/auth/refresh', { method: 'POST' });
    const refreshRes = await refresh({ request: refreshReq, locals: mockLocals, cookies });
    expect(refreshRes.status).toBe(200);
    const refreshData = await refreshRes.json();
    expect(refreshData.accessToken).toBeDefined();
    // Should have rotated refresh token
    expect(cookieStore.get('refresh')).not.toBe(oldRefresh);

    // 3. Logout
    const logoutReq = new Request('http://localhost/api/auth/logout', { method: 'POST' });
    const logoutRes = await logout({ request: logoutReq, locals: mockLocals, cookies });
    expect(logoutRes.status).toBe(200);
    expect(cookieStore.has('accessToken')).toBe(false);
    expect(cookieStore.has('refresh')).toBe(false);
  });
});
