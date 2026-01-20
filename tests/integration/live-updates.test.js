
import { describe, it, expect, beforeEach } from 'vitest';
import { GET as connectLive } from '../../src/pages/api/feed/live.ts';
import { POST as toggleLike } from '../../src/pages/api/likes.ts';
import { sign } from 'jsonwebtoken';

describe('Live Updates Integration', () => {
  let env;
  let mockLocals;

  beforeEach(() => {
    env = globalThis.testEnv;
    env.JWT_SECRET = 'test-jwt-secret';
    mockLocals = { runtime: { env } };
  });

  it('GET /api/feed/live should return a response from the Durable Object', async () => {
    // We can't easily mock the Upgrade request here without a real server context or using miniflare's dispatchFetch, 
    // but we are calling the handler directly.
    // The handler calls `stub.fetch(request)`. 
    // In Miniflare integration, `stub.fetch` should work.
    
    // Note: If we don't provide Upgrade headers, the DO might return 426 or 400 depending on implementation.
    // PostRoom likely expects a WebSocket upgrade.
    
    const req = new Request('http://localhost/api/feed/live', {
      headers: { Upgrade: 'websocket' }
    });

    const cookies = {
        get: (name) => name === 'accessToken' ? { value: 'mock-token' } : undefined
    };

    // In a direct handler call, we pass the request to the DO stub.
    // Miniflare's stub.fetch should handle this.
    const res = await connectLive({ request: req, locals: mockLocals, cookies });
    
    // If the DO accepts the connection, it returns 101.
    // However, our Miniflare generic mock for PostRoom returns 200.
    expect(res.status).toBe(200);
  });

  it('POST /api/likes should persist like and attempt to notify DO', async () => {
    const userId = 'user-live-' + Date.now();
    const postId = 'post-live-' + Date.now();
    const now = Math.floor(Date.now() / 1000);

    // Setup user and post
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, role, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)')
      .bind(userId, 'live@test.com', 'hash', 'Live User', 'user', now)
      .run();
    
    await env.DB.prepare('INSERT INTO posts (id, user_id, content, created_at, likes, media_refs) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(postId, userId, 'Live Post', now, '[]', null)
      .run();

    // Mock authenticated user
    const authenticatedLocals = {
      ...mockLocals,
      user: { sub: userId }
    };
    
    const req = new Request('http://localhost/api/likes', {
      method: 'POST',
      body: JSON.stringify({ target_id: postId, target_type: 'post' })
    });

    const token = sign({ sub: userId, email: 'live@test.com' }, 'test-jwt-secret');
    const cookies = {
        get: () => ({ value: token })
    };

    const res = await toggleLike({ request: req, locals: authenticatedLocals, cookies });
    expect(res.status).toBe(200);
    
    // We verified DB persistence in `likes.test.js`.
    // Here we just ensure that the DO interaction didn't cause a crash (e.g. 500)
    // Detailed verification of "did the DO send a message" requires a WS client test which is complex here.
  });
});
