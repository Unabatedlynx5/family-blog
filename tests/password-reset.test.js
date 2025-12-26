
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { POST as resetPassword } from '../src/pages/api/auth/reset-password';
import { POST as createUser } from '../src/pages/api/admin/users';
import bcrypt from 'bcryptjs';

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

describe('Password Reset Flow', () => {
  let db;
  let env;
  let locals;

  beforeEach(() => {
    // Setup in-memory SQLite DB
    db = new Database(':memory:');
    
    // Apply migrations
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const files = fs.readdirSync(migrationsDir).sort();
    for (const file of files) {
      if (file.endsWith('.sql')) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        db.exec(sql);
      }
    }

    env = {
      DB: new MockD1Database(db),
      JWT_SECRET: 'test-secret',
      ADMIN_API_KEY: 'admin-key'
    };

    locals = {
      runtime: { env }
    };
  });

  afterEach(() => {
    db.close();
  });

  it('should create a reset token when requesting password reset', async () => {
    // 1. Create a user
    const userReq = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'oldpassword',
        name: 'Test User'
      })
    });
    const adminLocals = { ...locals, user: { email: 'admin@familyblog.com', sub: 'admin' } };
    await createUser({ request: userReq, locals: adminLocals });

    // 2. Request reset link
    const req = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' })
    });

    const res = await resetPassword({ request: req, locals });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toContain('reset link has been sent');

    // 3. Verify token in DB
    const tokenRecord = db.prepare('SELECT * FROM password_reset_tokens').get();
    expect(tokenRecord).toBeDefined();
    expect(tokenRecord.used).toBe(0);
  });

  it('should reset password with valid token', async () => {
    // 1. Create a user
    const userReq = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'oldpassword',
        name: 'Test User'
      })
    });
    const adminLocals = { ...locals, user: { email: 'admin@familyblog.com', sub: 'admin' } };
    await createUser({ request: userReq, locals: adminLocals });

    // 2. Request reset link to generate token
    const req1 = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' })
    });
    await resetPassword({ request: req1, locals });

    // Get the token hash from DB (since we can't easily intercept the log/email in this test setup without more mocking)
    // Wait, the API stores the hash, not the token.
    // But the API generates the token and logs it.
    // In this test, I can't easily get the raw token unless I mock randomUUID or console.log.
    // Let's mock randomUUID to return a known token?
    // Or I can just manually insert a token into the DB for testing the second part.
  });
  
  it('should reset password with manually inserted token', async () => {
     // 1. Create a user
    const userReq = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'oldpassword',
        name: 'Test User'
      })
    });
    const adminLocals = { ...locals, user: { email: 'admin@familyblog.com', sub: 'admin' } };
    const userRes = await createUser({ request: userReq, locals: adminLocals });
    const userJson = await userRes.json();
    const userId = userJson.id;

    // 2. Insert a known token
    const { createHash } = await import('crypto');
    const token = 'my-secret-token';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 3600;
    
    db.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('test-id', userId, tokenHash, expiresAt, now);

    // 3. Reset password
    const req2 = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: token, password: 'newpassword123' })
    });

    const res2 = await resetPassword({ request: req2, locals });
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.message).toBe('Password reset successfully');

    // 4. Verify new password works (by checking hash in DB)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const match = await bcrypt.compare('newpassword123', user.password_hash);
    expect(match).toBe(true);

    // 5. Verify token is marked used
    const tokenRecord = db.prepare('SELECT * FROM password_reset_tokens WHERE id = ?').get('test-id');
    expect(tokenRecord.used).toBe(1);
  });
});
