
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { GET as getPosts } from '../src/pages/api/posts/index';

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

describe('Posts API Pagination Tests', () => {
  let db;
  let env;
  let mockLocals;
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
      DB: db
    };

    userId = 'user-123';
    mockLocals = {
      runtime: { env },
      user: { sub: userId, email: 'user@example.com', name: 'Test User' }
    };

    // Insert user
    sqlite.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, 'user@example.com', 'hash', 'Test User', 1, Date.now());

    // Insert 5 posts
    for (let i = 1; i <= 5; i++) {
        sqlite.prepare('INSERT INTO posts (id, user_id, content, created_at, likes) VALUES (?, ?, ?, ?, ?)')
          .run(`post-${i}`, userId, `Content ${i}`, 1000 + i, '[]');
    }
  });

  it('should return paginated posts', async () => {
    // Page 1, Limit 2
    const req1 = new Request('http://localhost/api/posts?page=1&limit=2');
    const url1 = new URL('http://localhost/api/posts?page=1&limit=2');
    
    const res1 = await getPosts({ locals: mockLocals, url: url1, request: req1 });
    expect(res1.status).toBe(200);
    
    const data1 = await res1.json();
    expect(data1.posts).toHaveLength(2);
    expect(data1.pagination.page).toBe(1);
    expect(data1.pagination.limit).toBe(2);
    expect(data1.pagination.total).toBe(5);
    expect(data1.pagination.totalPages).toBe(3);
    
    // Posts are ordered by created_at DESC, so post-5 and post-4 should be first
    expect(data1.posts[0].id).toBe('post-5');
    expect(data1.posts[1].id).toBe('post-4');

    // Page 2, Limit 2
    const req2 = new Request('http://localhost/api/posts?page=2&limit=2');
    const url2 = new URL('http://localhost/api/posts?page=2&limit=2');
    
    const res2 = await getPosts({ locals: mockLocals, url: url2, request: req2 });
    const data2 = await res2.json();
    
    expect(data2.posts).toHaveLength(2);
    expect(data2.posts[0].id).toBe('post-3');
    expect(data2.posts[1].id).toBe('post-2');

    // Page 3, Limit 2
    const req3 = new Request('http://localhost/api/posts?page=3&limit=2');
    const url3 = new URL('http://localhost/api/posts?page=3&limit=2');
    
    const res3 = await getPosts({ locals: mockLocals, url: url3, request: req3 });
    const data3 = await res3.json();
    
    expect(data3.posts).toHaveLength(1);
    expect(data3.posts[0].id).toBe('post-1');
  });
});
