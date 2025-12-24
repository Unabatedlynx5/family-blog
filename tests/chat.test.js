
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GlobalChat } from '../workers/GlobalChat';

// Mock Response to support status 101
global.Response = class extends Response {
  constructor(body, init) {
    if (init?.status === 101) {
      // Bypass validation for 101
      super(null, { ...init, status: 200 }); // Fake it as 200 internally but store real status
      Object.defineProperty(this, 'status', { value: 101 });
      Object.defineProperty(this, 'webSocket', { value: init.webSocket });
    } else {
      super(body, init);
    }
  }
};

// Mock WebSocket
class MockWebSocket {
  constructor() {
    this.listeners = {};
    this.sentMessages = [];
    this.readyState = 1; // OPEN
  }

  accept() {}

  send(data) {
    this.sentMessages.push(data);
  }

  addEventListener(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  // Helper to trigger events
  async trigger(event, data) {
    if (this.listeners[event]) {
      await Promise.all(this.listeners[event].map(cb => cb(data)));
    }
  }

  close() {
    this.trigger('close');
  }
}

// Mock WebSocketPair
global.WebSocketPair = class {
  constructor() {
    this.client = new MockWebSocket();
    this.server = new MockWebSocket();
    // Link them if needed, but for unit testing DO logic, we mostly interact with 'server' side
    return [this.client, this.server];
  }
};

// Mock DO State
class MockState {
  constructor() {
    this.storage = {
      data: new Map(),
      get: async (key) => this.storage.data.get(key),
      put: async (key, value) => this.storage.data.set(key, value),
      delete: async (key) => this.storage.data.delete(key)
    };
    this.initPromise = Promise.resolve();
    this.websockets = [];
  }

  blockConcurrencyWhile(callback) {
    this.initPromise = callback();
    return this.initPromise;
  }

  acceptWebSocket(ws) {
    this.websockets.push(ws);
    ws.accept();
  }

  getWebSockets() {
    return this.websockets;
  }
}

describe('GlobalChat Durable Object Tests', () => {
  let chat;
  let state;
  let env;
  let mockDb;

  beforeEach(async () => {
    state = new MockState();
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({})
        })
      })
    };
    env = { DB: mockDb };
    chat = new GlobalChat(state, env);
    // await state.initPromise; // No longer needed as we removed blockConcurrencyWhile
  });

  it('should initialize', async () => {
    expect(chat).toBeDefined();
  });

  it('should handle websocket upgrade', async () => {
    const req = new Request('http://localhost/api/chat/connect', {
      headers: { 'Upgrade': 'websocket' }
    });
    
    const res = await chat.fetch(req);
    expect(res.status).toBe(101);
    expect(res.webSocket).toBeDefined();
    expect(state.websockets.length).toBe(1);
  });

  it('should reject non-websocket requests', async () => {
    const req = new Request('http://localhost/api/chat/connect');
    const res = await chat.fetch(req);
    expect(res.status).toBe(400);
  });

  it('should NOT send history on connect (now handled by API)', async () => {
    const req = new Request('http://localhost/api/chat/connect', {
      headers: { 'Upgrade': 'websocket' }
    });
    
    const res = await chat.fetch(req);
    
    // Check that NO history message was sent immediately
    // The server socket is in state.websockets[0]
    const serverWs = state.websockets[0];
    expect(serverWs.sentMessages.length).toBe(0);
  });

  it('should broadcast messages and save to DB', async () => {
    const req = new Request('http://localhost/api/chat/connect', {
      headers: { 'Upgrade': 'websocket' }
    });
    await chat.fetch(req);
    
    const serverWs = state.websockets[0];
    
    // Simulate incoming message
    const payload = { type: 'message', user: 'Alice', userId: 'u1', email: 'alice@example.com', text: 'Hi Bob' };
    await chat.webSocketMessage(serverWs, JSON.stringify(payload));
    
    // Check broadcast
    expect(serverWs.sentMessages.length).toBe(1);
    const broadcastMsg = JSON.parse(serverWs.sentMessages[0]);
    expect(broadcastMsg.type).toBe('message');
    expect(broadcastMsg.message.user).toBe('Alice');
    expect(broadcastMsg.message.text).toBe('Hi Bob');
    
    // Check DB insertion
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO chat_messages'));
  });

  it('should cleanup messages via DELETE', async () => {
    // Not implemented anymore
    const req = new Request('http://localhost/api/chat/connect', { method: 'DELETE' });
    const res = await chat.fetch(req);
    expect(res.status).toBe(501);
  });
});
