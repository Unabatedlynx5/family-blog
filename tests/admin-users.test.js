import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { GET as listUsers, POST as createUser } from '../src/pages/api/admin/users';

// Mock D1 Database using better-sqlite3
class MockD1Database {
  constructor(db) {
    this.db = db;
  }

  prepare(query) {
    const stmt = this.db.prepare(query);
    
    const bindFn = (...args) => {
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

describe('Admin Users API', () => {
  let db;
  let env;
  let mockLocals;

  beforeEach(async () => {
    // Setup in-memory DB
    const sqlite = new Database(':memory:');
    
    // Apply migrations
    const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/001_init.sql'), 'utf-8');
    sqlite.exec(migration);
    const migrationRole = fs.readFileSync(path.resolve(__dirname, '../migrations/008_add_role.sql'), 'utf-8');
    sqlite.exec(migrationRole);

    db = new MockD1Database(sqlite);
    
    env = {
      DB: db,
      JWT_SECRET: 'test-secret',
      ADMIN_API_KEY: 'test-admin-key'
    };

    mockLocals = {
      runtime: { env },
      user: { email: 'admin@familyblog.com', sub: 'admin-id', role: 'admin' }
    };

    // Create some test users
    const users = [
      { email: 'user1@example.com', name: 'User One', password: 'password' },
      { email: 'user2@example.com', name: 'User Two', password: 'password' },
      { email: 'inactive@example.com', name: 'Inactive User', password: 'password' }
    ];

    for (const u of users) {
      const req = new Request('http://localhost/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(u)
      });
      await createUser({ request: req, locals: mockLocals });
    }
    
    // Mark inactive user
    // We need to access the underlying sqlite db to update directly as we don't have an update endpoint yet
    db.db.prepare("UPDATE users SET is_active = 0 WHERE email = 'inactive@example.com'").run();
  });

  it('should list users with pagination', async () => {
    const url = new URL('http://localhost/api/admin/users?page=1&limit=2');
    const req = new Request(url);

    const res = await listUsers({ request: req, locals: mockLocals, url });
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.users.length).toBe(2);
    expect(data.pagination.total).toBe(3);
    expect(data.pagination.totalPages).toBe(2);
  });

  it('should search users by name', async () => {
    const url = new URL('http://localhost/api/admin/users?search=One');
    const req = new Request(url);

    const res = await listUsers({ request: req, locals: mockLocals, url });
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.users.length).toBe(1);
    expect(data.users[0].email).toBe('user1@example.com');
  });

  it('should filter users by status', async () => {
    const url = new URL('http://localhost/api/admin/users?is_active=0');
    const req = new Request(url);

    const res = await listUsers({ request: req, locals: mockLocals, url });
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.users.length).toBe(1);
    expect(data.users[0].email).toBe('inactive@example.com');
  });

  it('should require authentication', async () => {
    const url = new URL('http://localhost/api/admin/users');
    const req = new Request(url);

    const res = await listUsers({ request: req, locals: { runtime: mockLocals.runtime }, url });
    expect(res.status).toBe(401);
  });

  it('should require admin privileges', async () => {
    const url = new URL('http://localhost/api/admin/users');
    const req = new Request(url);

    const res = await listUsers({ 
      request: req, 
      locals: { 
        runtime: mockLocals.runtime,
        user: { email: 'regular@user.com' }
      }, 
      url 
    });
    expect(res.status).toBe(403);
  });
});
