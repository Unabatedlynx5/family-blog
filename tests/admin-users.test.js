import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { GET as listUsers, POST as createUser } from '../src/pages/api/admin/users';
import { DELETE as deleteUser } from '../src/pages/api/admin/users/[id]';

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
          const result = stmt.run(...args);
          return {
            success: true,
            meta: {
              changes: result.changes,
              last_row_id: result.lastInsertRowid
            }
          };
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
        const result = stmt.run();
        return {
          success: true,
          meta: {
            changes: result.changes,
            last_row_id: result.lastInsertRowid
          }
        };
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

  describe('DELETE /api/admin/users/[id]', () => {
    it('should delete a user successfully', async () => {
      // First get a user ID to delete
      const user = db.db.prepare("SELECT id FROM users WHERE email = 'user1@example.com'").get();
      expect(user).toBeDefined();

      const res = await deleteUser({ 
        params: { id: user.id }, 
        locals: mockLocals 
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      // Verify user is gone
      const deletedUser = db.db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
      expect(deletedUser).toBeUndefined();
    });

    it('should return 404 for non-existent user', async () => {
      const res = await deleteUser({ 
        params: { id: 'non-existent-id' }, 
        locals: mockLocals 
      });
      
      expect(res.status).toBe(404);
    });

    it('should prevent deleting yourself', async () => {
      const res = await deleteUser({ 
        params: { id: 'admin-id' }, 
        locals: mockLocals 
      });
      
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Cannot delete yourself');
    });

    it('should require authentication', async () => {
      const res = await deleteUser({ 
        params: { id: 'some-id' }, 
        locals: { runtime: mockLocals.runtime } 
      });
      
      expect(res.status).toBe(401);
    });

    it('should require admin privileges', async () => {
      const res = await deleteUser({ 
        params: { id: 'some-id' }, 
        locals: { 
          runtime: mockLocals.runtime,
          user: { email: 'regular@user.com', sub: 'regular-id' }
        } 
      });
      
      expect(res.status).toBe(403);
    });
  });
});
