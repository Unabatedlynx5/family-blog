
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { POST as createUser } from '../src/pages/api/admin/users';
import { POST as login } from '../src/pages/api/auth/login';
import { POST as refresh } from '../src/pages/api/auth/refresh';
import { POST as logout } from '../src/pages/api/auth/logout';

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

describe('Authentication Tests', () => {
  let db;
  let env;
  let mockLocals;

  beforeEach(() => {
    // Setup in-memory DB
    const sqlite = new Database(':memory:');
    
    // Apply migrations
    const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/001_init.sql'), 'utf-8');
    sqlite.exec(migration);

    db = new MockD1Database(sqlite);
    
    env = {
      DB: db,
      JWT_SECRET: 'test-secret',
      ADMIN_API_KEY: 'test-admin-key'
    };

    mockLocals = {
      runtime: { env }
    };
  });

  it('should create an admin user', async () => {
    const req = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'test-admin-key'
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'password123',
        name: 'Admin User'
      })
    });

    const res = await createUser({ request: req, locals: mockLocals });
    expect(res.status).toBe(201);
    
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.ok).toBe(true);

    // Verify in DB
    const user = env.DB.db.prepare('SELECT * FROM users WHERE email = ?').get('admin@example.com');
    expect(user).toBeDefined();
    expect(user.name).toBe('Admin User');
  });

  it('should fail to create user with invalid admin key', async () => {
    const req = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'wrong-key'
      },
      body: JSON.stringify({
        email: 'hacker@example.com',
        password: 'password123'
      })
    });

    const res = await createUser({ request: req, locals: mockLocals });
    expect(res.status).toBe(401);
  });

  it('should login successfully', async () => {
    // First create a user (manually to skip API overhead)
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('password123', 10);
    env.DB.db.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('user-123', 'user@example.com', hash, 'Test User', 1, Date.now());

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'password123'
      })
    });

    // Mock cookies object
    const cookies = {
      set: vi.fn()
    };

    const res = await login({ request: req, locals: mockLocals, cookies });
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.accessToken).toBeDefined();
    expect(data.user.email).toBe('user@example.com');
    expect(data.user.name).toBe('Test User');
    
    // Check if refresh token cookie was set
    expect(cookies.set).toHaveBeenCalled();
    // The order of cookie setting might vary or be implementation detail, 
    // but we expect both 'accessToken' and 'refresh' to be set.
    const calls = cookies.set.mock.calls;
    const refreshCall = calls.find(call => call[0] === 'refresh');
    expect(refreshCall).toBeDefined();
    expect(refreshCall[2]).toMatchObject({ httpOnly: true });
  });

  it('should fail login with wrong password', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('password123', 10);
    env.DB.db.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('user-123', 'user@example.com', hash, 'Test User', 1, Date.now());

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'wrongpassword'
      })
    });

    const res = await login({ request: req, locals: mockLocals, cookies: { set: vi.fn() } });
    expect(res.status).toBe(401);
  });
});
