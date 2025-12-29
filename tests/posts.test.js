
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { POST as createPost } from '../src/pages/api/posts/index';
import { GET as getPost } from '../src/pages/api/posts/[id]';

// Mock D1 Database using better-sqlite3
class MockD1Database {
  constructor(db) {
    this.db = db;
  }

  prepare(query) {
    const stmt = this.db.prepare(query);
    return {
      bind: (...args) => {
        this.boundArgs = args;
        return {
          first: async () => {
            try {
              return stmt.get(...args);
            } catch (e) {
              return null;
            }
          },
          run: async () => {
            return stmt.run(...args);
          },
          all: async () => {
            return { results: stmt.all(...args) };
          }
        };
      }
    };
  }
}

describe('Posts API Tests', () => {
  let db;
  let env;
  let mockLocals;
  let validToken;
  let userId;

  beforeEach(() => {
    // Setup in-memory DB
    const sqlite = new Database(':memory:');
    
    // Apply migrations
    const migrationsDir = path.resolve(__dirname, '../migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).sort();
    for (const file of migrationFiles) {
        if (file.endsWith('.sql')) {
            const migration = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
            sqlite.exec(migration);
        }
    }

    db = new MockD1Database(sqlite);
    
    env = {
      DB: db,
      JWT_SECRET: 'test-secret'
    };

    // Create a user
    userId = 'user-123';
    sqlite.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, 'user@example.com', 'hash', 'Test User', 1, Date.now());

    mockLocals = {
      runtime: { env },
      user: { sub: userId, email: 'user@example.com', name: 'Test User' }
    };

    // Generate valid token
    validToken = jwt.sign({ sub: userId, email: 'user@example.com' }, 'test-secret', { expiresIn: '1h' });
  });

  it('should create a post', async () => {
    const req = new Request('http://localhost/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Hello World'
      })
    });

    const cookies = {
      get: (name) => name === 'accessToken' ? { value: validToken } : undefined
    };

    const res = await createPost({ request: req, locals: mockLocals, cookies });
    expect(res.status).toBe(201);
    
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.post.content).toBe('Hello World');
    expect(data.post.user_id).toBe(userId);

    // Verify in DB
    const post = env.DB.db.prepare('SELECT * FROM posts WHERE id = ?').get(data.post.id);
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

    const cookies = {
      get: () => undefined
    };

    // Remove user from locals to simulate unauthenticated
    const unauthLocals = { ...mockLocals, user: null };

    const res = await createPost({ request: req, locals: unauthLocals, cookies });
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

    const cookies = {
      get: (name) => name === 'accessToken' ? { value: validToken } : undefined
    };

    const res = await createPost({ request: req, locals: mockLocals, cookies });
    expect(res.status).toBe(400);
  });

  it('should get a post by id', async () => {
    // Create a post first
    const postId = 'post-123';
    env.DB.db.prepare('INSERT INTO posts (id, user_id, content, created_at, likes) VALUES (?, ?, ?, ?, ?)')
      .run(postId, userId, 'Test Content', Math.floor(Date.now() / 1000), JSON.stringify([userId]));

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
