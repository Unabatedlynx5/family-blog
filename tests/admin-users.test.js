import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GET as listUsers, POST as createUser } from '../src/pages/api/admin/users';
import { DELETE as deleteUser } from '../src/pages/api/admin/users/[id]';
import { applyMigrations } from './utils/db';
import { setupMiniflare } from './utils/miniflare';
import { createMockContext } from './utils/mocks';

describe('Admin Users API', () => {
  let mf;
  let env;
  let mockLocals;

  beforeEach(async () => {
    const setup = await setupMiniflare();
    mf = setup.mf;
    env = setup.env;
    
    await applyMigrations(env.DB);

    mockLocals = createMockContext(env, { 
      email: 'admin@familyblog.com', 
      sub: 'admin-id', 
      role: 'admin' 
    });

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
    await env.DB.prepare("UPDATE users SET is_active = 0 WHERE email = 'inactive@example.com'").run();
  });

  afterEach(async () => {
    await mf.dispose();
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

    const res = await listUsers({ request: req, locals: createMockContext(env), url });
    expect(res.status).toBe(401);
  });

  it('should require admin privileges', async () => {
    const url = new URL('http://localhost/api/admin/users');
    const req = new Request(url);

    const res = await listUsers({ 
      request: req, 
      locals: createMockContext(env, { email: 'regular@user.com' }), 
      url 
    });
    expect(res.status).toBe(403);
  });

  describe('DELETE /api/admin/users/[id]', () => {
    it('should delete a user successfully', async () => {
      // First get a user ID to delete
      const user = await env.DB.prepare("SELECT id FROM users WHERE email = 'user1@example.com'").first();
      expect(user).toBeDefined();

      const res = await deleteUser({ 
        params: { id: user.id }, 
        locals: mockLocals 
      });
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      // Verify user is gone
      const deletedUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
      expect(deletedUser).toBeNull();
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
        locals: createMockContext(env) 
      });
      
      expect(res.status).toBe(401);
    });

    it('should require admin privileges', async () => {
      const res = await deleteUser({ 
        params: { id: 'some-id' }, 
        locals: createMockContext(env, { email: 'regular@user.com', sub: 'regular-id' })
      });
      
      expect(res.status).toBe(403);
    });
  });
});
