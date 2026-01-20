
import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '../../src/pages/api/posts/index.ts';

describe('Posts API Integration', () => {
  let env;
  let mockLocals;
  let userId;

  beforeEach(async () => {
    env = globalThis.testEnv;
    userId = 'test-user-id';

    // Seed User
    await env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, name, is_active, created_at) 
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(userId, 'tester@example.com', 'hash123', 'Test User', 1, Math.floor(Date.now()/1000))
    .run();
    
    mockLocals = {
      runtime: { env },
      user: {
        sub: userId,
        email: 'tester@example.com',
        name: 'Test User',
        role: 'user'
      }
    };
  });

  it('should return empty list initially', async () => {
    const req = new Request('http://localhost/api/posts');
    const url = new URL(req.url); // Passed to GET
    
    const res = await GET({ request: req, locals: mockLocals, url });
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.posts).toEqual([]);
    expect(data.pagination.total).toBe(0);
  });

  it('should create a new post', async () => {
    const content = 'Hello World';
    const req = new Request('http://localhost/api/posts', {
      method: 'POST',
      body: JSON.stringify({ content }),
      headers: { 'Content-Type': 'application/json' }
    });

    const res = await POST({ request: req, locals: mockLocals });
    const data = await res.json();
    
    expect(res.status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.post.content).toBe(content);
    expect(data.post.user_id).toBe(userId);

    // Verify in DB
    const dbPost = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(data.post.id).first();
    expect(dbPost).toBeDefined();
    expect(dbPost.content).toBe(content);
  });

  it('should list created posts', async () => {
    // Create 3 posts
    for (let i = 1; i <= 3; i++) {
        await env.DB.prepare('INSERT INTO posts (id, user_id, content, created_at) VALUES (?, ?, ?, ?)')
          .bind(`post-${i}`, userId, `Content ${i}`, Math.floor(Date.now()/1000) + i)
          .run();
    }

    const req = new Request('http://localhost/api/posts?page=1&limit=10');
    const url = new URL(req.url); 

    const res = await GET({ request: req, locals: mockLocals, url });
    const data = await res.json();

    expect(data.posts.length).toBe(3);
    expect(data.posts[0].content).toBe('Content 3'); // API sorts DESC
    expect(data.pagination.total).toBe(3);
  });
  
  it('should require authentication for creation', async () => {
    mockLocals.user = null;
    
    const req = new Request('http://localhost/api/posts', {
      method: 'POST',
      body: JSON.stringify({ content: 'Secret' })
    });

    const res = await POST({ request: req, locals: mockLocals });
    expect(res.status).toBe(401);
  });
});
