
import { describe, it, expect, beforeEach, vi } from 'vitest';
// We import the handlers directly to test them with our managed environment
import { POST as createUser } from '../../src/pages/api/admin/users';
import { POST as login } from '../../src/pages/api/auth/login';

describe('Auth Integration Tests', () => {
  let env;
  let mockLocals;

  beforeEach(() => {
    // Use the global environment set up by setup.js
    env = globalThis.testEnv;
    
    // Locals mock that mimics Astro's locals
    mockLocals = {
      runtime: { env },
      user: null
    };
    
    // Mock cookies
    const cookieMap = new Map();
    mockLocals.cookies = {
      get: (name) => ({ value: cookieMap.get(name) }),
      set: (name, value, options) => cookieMap.set(name, value),
      delete: (name) => cookieMap.delete(name)
    };
  });

  it('should create a user when authenticated as admin', async () => {
    // 1. Mock Admin User in Locals
    mockLocals.user = {
      sub: 'admin-id',
      email: 'admin@familyblog.com',
      name: 'Super Admin',
      role: 'admin'
    };

    const req = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User'
      })
    });
    
    // We pass our explicit mockLocals which contains the REAL Miniflare D1 binding
    const res = await createUser({ request: req, locals: mockLocals });
    
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.id).toBeDefined();

    // 2. Verify directly in the DB
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
      .bind('newuser@example.com')
      .first();
      
    expect(user).toBeDefined();
    expect(user.name).toBe('New User');
    // Check password hash exists
    expect(user.password_hash).toBeDefined();
  });

  it('should login successfully with valid credentials', async () => {
    // First, insert a user manually into the DB to test login against
    // We can reuse the `env` to seed data!
    const testValues = {
      id: 'test-user-id',
      email: 'login@example.com',
      // hashed password for 'password123' (bcrypt) via a utility or mocked if possible?
      // Since `login.ts` uses `verifyPassword` from workers/utils/auth.js, we need to ensure functionality.
      // But typically we can't easily generate a bcrypt hash without importing the library.
      // Let's rely on the `createUser` endpoint from the previous test or import the utility!
      // But we can just use the `createUser` logic again if we have admin access handy, 
      // OR import the hashing util.
    };
    
    // Let's try to import the hash utility from workers/utils/auth.ts (if available/resolvable)
    // Actually, let's just use the `createUser` endpoint to make the user first, easier integration testing.
    
    // 1. Create User via Admin API
    mockLocals.user = {
      sub: 'admin-id',
      email: 'admin@familyblog.com',
      role: 'admin'
    };
    
    await createUser({ 
        request: new Request('http://localhost', {
            method: 'POST',
            body: JSON.stringify({
                email: 'login-test@example.com',
                password: 'password123',
                name: 'Login Test'
            })
        }), 
        locals: mockLocals 
    });

    // 2. Attempt Login
    // Reset locals for login attempt (no user logged in)
    mockLocals.user = null;
    const cookies = {
        set: vi.fn(),
        get: vi.fn(),
        delete: vi.fn()
    };
    
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'login-test@example.com',
        password: 'password123'
      })
    });

    const res = await login({ request: req, locals: mockLocals, cookies, clientAddress: '127.0.0.1' });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.accessToken).toBeDefined();
    
    // Verify cookies were set
    expect(cookies.set).toHaveBeenCalledWith('accessToken', expect.any(String), expect.any(Object));
    expect(cookies.set).toHaveBeenCalledWith('refresh', expect.any(String), expect.any(Object));
  });
});
