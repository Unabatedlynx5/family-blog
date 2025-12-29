import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { GET as connectLive } from '../src/pages/api/feed/live';
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

// Mock Durable Object Stub
const mockFetch = vi.fn();
const mockStub = {
  fetch: mockFetch
};

const mockPostRoom = {
  idFromName: vi.fn().mockReturnValue('mock-do-id'),
  get: vi.fn().mockReturnValue(mockStub)
};

describe('Live Updates & Durable Object Tests', () => {
  let db;
  let env;
  let mockLocals;
  let validToken;
  let userId;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(new Response('OK'));

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
      JWT_SECRET: 'test-secret',
      POST_ROOM: mockPostRoom
    };

    userId = 'user-123';
    sqlite.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, 'user@example.com', 'hash', 'Test User', 1, Date.now());

    // Create a post for testing likes
    sqlite.prepare('INSERT INTO posts (id, user_id, content, created_at, likes) VALUES (?, ?, ?, ?, ?)')
      .run('post-1', userId, 'Test Post', Date.now(), '[]');

    mockLocals = {
      runtime: { env },
      user: { sub: userId, email: 'user@example.com', name: 'Test User' }
    };

    validToken = jwt.sign({ sub: userId, email: 'user@example.com' }, 'test-secret', { expiresIn: '1h' });
  });

  describe('GET /api/feed/live', () => {
    it('should proxy WebSocket upgrade to Durable Object', async () => {
      const req = new Request('http://localhost/api/feed/live', {
        headers: { Upgrade: 'websocket' }
      });
      
      await connectLive({ request: req, locals: mockLocals });

      expect(mockPostRoom.idFromName).toHaveBeenCalledWith('FEED');
      expect(mockPostRoom.get).toHaveBeenCalledWith('mock-do-id');
      expect(mockFetch).toHaveBeenCalledWith(req);
    });
  });

  describe('POST /api/likes (Live Updates)', () => {
    it('should notify DO when a post is liked', async () => {
      const req = new Request('http://localhost/api/likes', {
        method: 'POST',
        body: JSON.stringify({ target_id: 'post-1', target_type: 'post' })
      });
      
      const cookies = {
        get: () => ({ value: validToken })
      };

      await toggleLike({ request: req, locals: mockLocals, cookies });

      // Verify DO notification
      expect(mockPostRoom.idFromName).toHaveBeenCalledWith('FEED');
      expect(mockFetch).toHaveBeenCalled();
      
      const fetchCall = mockFetch.mock.calls[0];
      // The URL might be anything, usually it's just a fetch to the stub
      
      // Check the body sent to the DO
      const body = JSON.parse(fetchCall[1].body);
      expect(body.type).toBe('LIKE_UPDATE');
      expect(body.postId).toBe('post-1');
      expect(body.count).toBe(1);
    });
  });
});
