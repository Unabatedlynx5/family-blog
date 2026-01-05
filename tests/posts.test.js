import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { POST as createPost } from '../src/pages/api/posts/index';
import { GET as getPost } from '../src/pages/api/posts/[id]';
import { applyMigrations } from './utils/db';
import { setupMiniflare } from './utils/miniflare';
import { createMockContext } from './utils/mocks';

describe('Posts API Tests', () => {
  let mf;
  let env;
  let mockLocals;
  let userId;

  beforeEach(async () => {
    const setup = await setupMiniflare();
    mf = setup.mf;
    env = setup.env;
    
    await applyMigrations(env.DB);

    // Create a user
    userId = 'user-123';
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(userId, 'user@example.com', 'hash', 'Test User', 1, Date.now())
      .run();

    mockLocals = createMockContext(env, { 
      sub: userId, 
      email: 'user@example.com', 
      name: 'Test User' 
    });
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it('should create a post', async () => {
    const req = new Request('http://localhost/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Hello World'
      })
    });

    const res = await createPost({ request: req, locals: mockLocals });
    expect(res.status).toBe(201);
    
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.post.content).toBe('Hello World');
    expect(data.post.user_id).toBe(userId);

    // Verify in DB
    const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(data.post.id).first();
    expect(post).toBeDefined();
    expect(post.content).toBe('Hello World');
  });

  it('should fail to create post without auth', async () => {
    const req = new Request('http://localhost/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Hello World'
      })
    });

    // Remove user from locals to simulate unauthenticated
    const unauthLocals = createMockContext(env);

    const res = await createPost({ request: req, locals: unauthLocals });
    expect(res.status).toBe(401);
  });

  it('should fail to create post with empty content', async () => {
    const req = new Request('http://localhost/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '   '
      })
    });

    const res = await createPost({ request: req, locals: mockLocals });
    expect(res.status).toBe(400);
  });

  it('should get a post by id', async () => {
    // Create a post first
    const postId = 'post-123';
    await env.DB.prepare('INSERT INTO posts (id, user_id, content, created_at, likes) VALUES (?, ?, ?, ?, ?)')
      .bind(postId, userId, 'Test Content', Math.floor(Date.now() / 1000), JSON.stringify([userId]))
      .run();

    const req = new Request(`http://localhost/api/posts/${postId}`);
    
    const res = await getPost({ params: { id: postId }, locals: mockLocals, request: req });
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.post.id).toBe(postId);
    expect(data.post.content).toBe('Test Content');
    expect(data.post.name).toBe('Test User'); // Joined from users table
    expect(data.post.like_count).toBe(1);
    expect(data.post.user_has_liked).toBe(1);
  });

  it('should return 404 for non-existent post', async () => {
    const req = new Request('http://localhost/api/posts/non-existent');
    
    const res = await getPost({ params: { id: 'non-existent' }, locals: mockLocals, request: req });
    expect(res.status).toBe(404);
  });
});
