import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { GET as getMessages } from '../src/pages/api/chat/messages';
import { POST as updatePresence } from '../src/pages/api/chat/presence';
import { GET as connectChat } from '../src/pages/api/chat/connect';

// Mock Response to support status 101
const OriginalResponse = global.Response;
global.Response = class extends OriginalResponse {
  constructor(body, init) {
    if (init?.status === 101) {
      super(null, { ...init, status: 200 });
      Object.defineProperty(this, 'status', { value: 101 });
    } else {
      super(body, init);
    }
  }
};

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

describe('Chat API Tests', () => {
  let db;
  let env;
  let mockLocals;
  let validToken;
  let userId;

  beforeEach(() => {
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

    userId = 'user-123';
    sqlite.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, 'user@example.com', 'hash', 'Test User', 1, Date.now());

    mockLocals = {
      runtime: { env },
      user: { sub: userId, email: 'user@example.com', name: 'Test User' }
    };

    validToken = jwt.sign({ sub: userId, email: 'user@example.com' }, 'test-secret', { expiresIn: '1h' });
  });

  it('GET /api/chat/messages should return messages', async () => {
    // Insert some messages
    const now = Math.floor(Date.now() / 1000);
    env.DB.db.prepare('INSERT INTO chat_messages (id, user_id, user_name, user_email, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('msg-1', userId, 'Test User', 'user@example.com', 'Hello', now);

    const req = new Request('http://localhost/api/chat/messages');
    const cookies = {
      get: (name) => name === 'accessToken' ? { value: validToken } : undefined
    };

    const res = await getMessages({ request: req, locals: mockLocals, cookies });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].text).toBe('Hello');
  });

  it('GET /api/chat/messages should fail without token', async () => {
    const req = new Request('http://localhost/api/chat/messages');
    const cookies = {
      get: () => undefined
    };

    const res = await getMessages({ request: req, locals: mockLocals, cookies });
    expect(res.status).toBe(401);
  });

  it('POST /api/chat/presence should update last_seen', async () => {
    const req = new Request('http://localhost/api/chat/presence', { method: 'POST' });
    const cookies = {
      get: (name) => name === 'accessToken' ? { value: validToken } : undefined
    };

    const res = await updatePresence({ request: req, locals: mockLocals, cookies });
    expect(res.status).toBe(200);
    
    const user = env.DB.db.prepare('SELECT last_seen FROM users WHERE id = ?').get(userId);
    expect(user.last_seen).toBeDefined();
    expect(user.last_seen).toBeGreaterThan(0);
  });

  it('GET /api/chat/connect should proxy to Durable Object', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 101 }));
    env.GLOBAL_CHAT = {
      idFromName: () => 'mock-id',
      get: () => ({ fetch: mockFetch })
    };

    const req = new Request('http://localhost/api/chat/connect');
    // Mock locals.user is already set in beforeEach
    
    const res = await connectChat({ request: req, locals: mockLocals });
    expect(res.status).toBe(101);
    expect(mockFetch).toHaveBeenCalled();
    
    // Check if headers were passed
    const sentReq = mockFetch.mock.calls[0][0];
    expect(sentReq.headers.get('X-User-ID')).toBe(userId);
  });
});
