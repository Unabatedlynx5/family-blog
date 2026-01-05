import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { GET as getMessages } from '../src/pages/api/chat/messages';
import { POST as updatePresence } from '../src/pages/api/chat/presence';
import { GET as connectChat } from '../src/pages/api/chat/connect';
import { applyMigrations } from './utils/db';
import { setupMiniflare } from './utils/miniflare';
import { createMockContext } from './utils/mocks';

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

describe('Chat API Tests', () => {
  let mf;
  let env;
  let mockLocals;
  let validToken;
  let userId;

  beforeEach(async () => {
    const setup = await setupMiniflare();
    mf = setup.mf;
    env = setup.env;
    
    await applyMigrations(env.DB);

    userId = 'user-123';
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(userId, 'user@example.com', 'hash', 'Test User', 1, Date.now())
      .run();

    mockLocals = createMockContext(env, { 
      sub: userId, 
      email: 'user@example.com', 
      name: 'Test User' 
    });

    validToken = jwt.sign({ sub: userId, email: 'user@example.com' }, 'test-secret', { expiresIn: '1h' });
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it('GET /api/chat/messages should return messages', async () => {
    // Insert some messages
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('INSERT INTO chat_messages (id, user_id, user_name, user_email, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind('msg-1', userId, 'Test User', 'user@example.com', 'Hello', now)
        .run();

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
    
    const user = await env.DB.prepare('SELECT last_seen FROM users WHERE id = ?').bind(userId).first();
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
