import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { POST as toggleLike } from '../src/pages/api/likes';

// Mock D1 Database using better-sqlite3
class MockD1Database {
  constructor(db) {
    this.db = db;
  }

  prepare(query) {
    const stmt = this.db.prepare(query);
    const methods = {
      bind: (...args) => {
        this.boundArgs = args;
        return methods;
      },
      first: async () => {
        try {
          return stmt.get(...(this.boundArgs || []));
        } catch (e) {
          return null;
        }
      },
      run: async () => {
        return stmt.run(...(this.boundArgs || []));
      },
      all: async () => {
        return { results: stmt.all(...(this.boundArgs || [])) };
      }
    };
    return methods;
  }
}

describe('Likes JSON Logic', () => {
  let db;
  let env;
  let jwtSecret = 'test-secret';
  let mockPostRoom;

  beforeEach(() => {
    const sqlite = new Database(':memory:');
    
    // Create posts table with likes column (JSON)
    sqlite.exec(`
      CREATE TABLE posts (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        content TEXT,
        likes TEXT DEFAULT '[]',
        created_at INTEGER
      );
    `);

    // Insert a test post
    sqlite.prepare("INSERT INTO posts (id, user_id, content, likes, created_at) VALUES (?, ?, ?, ?, ?)")
      .run('post-1', 'author-1', 'Hello World', '[]', Date.now());

    db = new MockD1Database(sqlite);
    
    mockPostRoom = {
      idFromName: vi.fn().mockReturnValue('mock-do-id'),
      get: vi.fn().mockReturnValue({ fetch: vi.fn() })
    };

    env = {
      DB: db,
      JWT_SECRET: jwtSecret,
      POST_ROOM: mockPostRoom
    };
  });

  const createRequest = (userId, targetId) => {
    const token = jwt.sign({ sub: userId, email: 'test@example.com' }, jwtSecret);
    
    const request = new Request('http://localhost/api/likes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ target_id: targetId, target_type: 'post' })
    });

    return {
      request,
      locals: { runtime: { env } },
      cookies: { get: () => ({ value: token }) }
    };
  };

  it('should correctly handle multiple users liking and unliking (JSON array logic)', async () => {
    const userA = 'user-A';
    const userB = 'user-B';
    const postId = 'post-1';

    // 1. User A likes the post
    const ctxA = createRequest(userA, postId);
    let res = await toggleLike(ctxA);
    let data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.liked).toBe(true);
    expect(data.count).toBe(1);

    // Verify DB
    let post = env.DB.db.prepare('SELECT likes FROM posts WHERE id = ?').get(postId);
    let likes = JSON.parse(post.likes);
    expect(likes).toContain(userA);
    expect(likes.length).toBe(1);

    // 2. User B likes the same post
    const ctxB = createRequest(userB, postId);
    res = await toggleLike(ctxB);
    data = await res.json();

    expect(res.status).toBe(200);
    expect(data.liked).toBe(true);
    expect(data.count).toBe(2);

    // Verify DB has both
    post = env.DB.db.prepare('SELECT likes FROM posts WHERE id = ?').get(postId);
    likes = JSON.parse(post.likes);
    expect(likes).toContain(userA);
    expect(likes).toContain(userB);
    expect(likes.length).toBe(2);

    // 3. User A unlikes the post
    // Create new request for User A
    const ctxA2 = createRequest(userA, postId);
    res = await toggleLike(ctxA2);
    data = await res.json();

    expect(res.status).toBe(200);
    expect(data.liked).toBe(false);
    expect(data.count).toBe(1);

    // Verify DB: User A is gone, User B remains
    post = env.DB.db.prepare('SELECT likes FROM posts WHERE id = ?').get(postId);
    likes = JSON.parse(post.likes);
    expect(likes).not.toContain(userA);
    expect(likes).toContain(userB);
    expect(likes.length).toBe(1);
  });

  it('should handle invalid JSON in likes column gracefully', async () => {
    // Corrupt the likes column
    env.DB.db.prepare("UPDATE posts SET likes = 'invalid-json' WHERE id = ?").run('post-1');

    const userA = 'user-A';
    const ctx = createRequest(userA, 'post-1');
    
    const res = await toggleLike(ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.liked).toBe(true);
    expect(data.count).toBe(1);

    // Verify it reset to array with user
    const post = env.DB.db.prepare('SELECT likes FROM posts WHERE id = ?').get('post-1');
    const likes = JSON.parse(post.likes);
    expect(likes).toEqual([userA]);
  });

  it('should return 404 for non-existent post', async () => {
    const ctx = createRequest('user-A', 'non-existent-post');
    const res = await toggleLike(ctx);
    
    expect(res.status).toBe(404);
  });
});
