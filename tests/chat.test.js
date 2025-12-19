
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
  }

  blockConcurrencyWhile(callback) {
    this.initPromise = callback();
    return this.initPromise;
  }
}

describe('GlobalChat Durable Object Tests', () => {
  let chat;
  let state;
  let env;

  beforeEach(async () => {
    state = new MockState();
    env = {};
    chat = new GlobalChat(state, env);
    await state.initPromise;
  });

  it('should initialize with empty messages', async () => {
    expect(chat.messages).toEqual([]);
  });

  it('should handle websocket upgrade', async () => {
    const req = new Request('http://localhost/api/chat/connect', {
      headers: { 'Upgrade': 'websocket' }
    });
    
    const res = await chat.fetch(req);
    expect(res.status).toBe(101);
    expect(res.webSocket).toBeDefined();
  });

  it('should reject non-websocket requests', async () => {
    const req = new Request('http://localhost/api/chat/connect');
    const res = await chat.fetch(req);
    expect(res.status).toBe(400);
  });

  it('should send history on connect', async () => {
    // Pre-populate messages
    const history = [{ id: '1', user: 'User', text: 'Hello', created_at: 123 }];
    await state.storage.put('messages', history);
    
    // Re-init to load storage
    chat = new GlobalChat(state, env);
    await state.initPromise;

    const req = new Request('http://localhost/api/chat/connect', {
      headers: { 'Upgrade': 'websocket' }
    });
    
    const res = await chat.fetch(req);
    const clientWs = res.webSocket;
    
    // The server side socket is where the DO writes to
    // In our mock, we need to access the server socket that was created inside fetch
    // But fetch returns the client socket.
    // We can spy on handleSession or just check the client socket if we linked them.
    // Since our MockWebSocketPair returns independent mocks, we can't easily check what was sent to 'client' 
    // by inspecting 'client' unless we link them.
    
    // Let's inspect the internal sockets map of the chat instance
    // Wait for async handleSession to finish (it's awaited in fetch)
    
    expect(chat.sockets.size).toBe(1);
    const serverWs = chat.sockets.values().next().value;
    
    expect(serverWs.sentMessages.length).toBe(1);
    const msg = JSON.parse(serverWs.sentMessages[0]);
    expect(msg.type).toBe('history');
    expect(msg.messages).toEqual(history);
  });

  it('should broadcast messages', async () => {
    const req = new Request('http://localhost/api/chat/connect', {
      headers: { 'Upgrade': 'websocket' }
    });
    await chat.fetch(req);
    
    const serverWs = chat.sockets.values().next().value;
    
    // Simulate incoming message
    const payload = { type: 'message', user: 'Alice', text: 'Hi Bob' };
    await serverWs.trigger('message', { data: JSON.stringify(payload) });
    
    // Check broadcast
    // It should send to all sockets (including sender)
    // The first message was history, second should be the new message
    expect(serverWs.sentMessages.length).toBe(2);
    const broadcastMsg = JSON.parse(serverWs.sentMessages[1]);
    expect(broadcastMsg.type).toBe('message');
    expect(broadcastMsg.message.user).toBe('Alice');
    expect(broadcastMsg.message.text).toBe('Hi Bob');
    
    // Check storage
    expect(chat.messages.length).toBe(1);
    expect(chat.messages[0].text).toBe('Hi Bob');
  });

  it('should cleanup messages via DELETE', async () => {
    // Add some messages
    chat.messages = [
      { id: '1', user: 'Anonymous', text: 'spam' },
      { id: '2', user: 'User', text: 'valid' },
      { id: '3', user: 'User', text: '   ' } // empty
    ];
    
    const req = new Request('http://localhost/api/chat/connect', {
      method: 'DELETE'
    });
    
    const res = await chat.fetch(req);
    const data = await res.json();
    
    expect(data.deleted).toBe(2); // Anonymous and empty
    expect(data.remaining).toBe(1);
    expect(chat.messages[0].text).toBe('valid');
  });
});
