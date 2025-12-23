
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { POST as login } from '../src/pages/api/auth/login';
import { POST as createPost } from '../src/pages/api/posts/index';
import { GET as getFeed } from '../src/pages/api/feed';

// Mock D1 Database using better-sqlite3
class MockD1Database {
  constructor(db) {
    this.db = db;
  }

  prepare(query) {
    const stmt = this.db.prepare(query);
    const bindFn = (...args) => {
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
    };

    return {
      bind: bindFn,
      first: async () => {
        try {
          return stmt.get();
        } catch (e) {
          return null;
        }
      },
      run: async () => {
        return stmt.run();
      },
      all: async () => {
        return { results: stmt.all() };
      }
    };
  }
}

// Mock astro:content
vi.mock('astro:content', () => ({
  getCollection: vi.fn().mockResolvedValue([])
}));

describe('Integration Flow', () => {
  let db;
  let env;
  let mockLocals;

  beforeEach(async () => {
    // Setup in-memory DB
    const sqlite = new Database(':memory:');
    const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/001_init.sql'), 'utf-8');
    sqlite.exec(migration);
    db = new MockD1Database(sqlite);
    
    env = {
      DB: db,
      JWT_SECRET: 'test-secret'
    };

    mockLocals = {
      runtime: { env }
    };

    // Create user
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('password123', 10);
    sqlite.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('user-1', 'user@example.com', hash, 'Integration User', 1, Date.now());
  });

  it('should allow user to login, create post, and see it in feed', async () => {
    // 1. Login
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password123' })
    });
    
    const loginRes = await login({ request: loginReq, locals: mockLocals, cookies: { set: vi.fn() } });
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    const token = loginData.accessToken;
    expect(token).toBeDefined();

    // Update locals with authenticated user (simulating middleware)
    mockLocals.user = {
        sub: loginData.user.id,
        email: loginData.user.email,
        name: loginData.user.name
    };

    // 2. Create Post
    const postReq = new Request('http://localhost/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Integration Test Post' })
    });
    
    const cookies = {
      get: (name) => name === 'accessToken' ? { value: token } : undefined
    };

    const postRes = await createPost({ request: postReq, locals: mockLocals, cookies });
    expect(postRes.status).toBe(201);
    const postData = await postRes.json();
    expect(postData.post.content).toBe('Integration Test Post');

    // 3. Get Feed
    const feedReq = new Request('http://localhost/api/feed');
    const feedUrl = new URL('http://localhost/api/feed');
    
    const feedRes = await getFeed({ request: feedReq, locals: mockLocals, url: feedUrl });
    expect(feedRes.status).toBe(200);
    const feedData = await feedRes.json();
    
    expect(feedData.posts.length).toBeGreaterThan(0);
    expect(feedData.posts[0].content).toBe('Integration Test Post');
    expect(feedData.posts[0].name).toBe('Integration User');
  });
});
