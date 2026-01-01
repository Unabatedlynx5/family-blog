import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { GET as getCSRFToken } from '../src/pages/api/csrf';
import { generateCSRFToken, verifyCSRFToken } from '../workers/utils/csrf';

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

describe('CSRF Protection', () => {
  let db;
  let env;
  const jwtSecret = 'test-secret-key-for-csrf-testing-32chars';
  const userId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    const sqlite = new Database(':memory:');
    
    db = new MockD1Database(sqlite);
    env = {
      DB: db,
      JWT_SECRET: jwtSecret
    };
  });

  describe('CSRF Token Generation', () => {
    it('should generate a valid CSRF token', () => {
      const { token, expires } = generateCSRFToken(userId, jwtSecret);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(2); // data.signature format
      expect(expires).toBeGreaterThan(Date.now());
    });

    it('should verify a valid token', () => {
      const { token } = generateCSRFToken(userId, jwtSecret);
      
      const isValid = verifyCSRFToken(token, userId, jwtSecret);
      expect(isValid).toBe(true);
    });

    it('should reject token with wrong user ID', () => {
      const { token } = generateCSRFToken(userId, jwtSecret);
      
      const isValid = verifyCSRFToken(token, 'different-user-id', jwtSecret);
      expect(isValid).toBe(false);
    });

    it('should reject token with wrong secret', () => {
      const { token } = generateCSRFToken(userId, jwtSecret);
      
      const isValid = verifyCSRFToken(token, userId, 'wrong-secret');
      expect(isValid).toBe(false);
    });

    it('should reject malformed tokens', () => {
      expect(verifyCSRFToken('', userId, jwtSecret)).toBe(false);
      expect(verifyCSRFToken('invalid', userId, jwtSecret)).toBe(false);
      expect(verifyCSRFToken('no.dots.here', userId, jwtSecret)).toBe(false);
      expect(verifyCSRFToken(null, userId, jwtSecret)).toBe(false);
      expect(verifyCSRFToken(undefined, userId, jwtSecret)).toBe(false);
    });
  });

  describe('GET /api/csrf', () => {
    it('should return CSRF token for authenticated user', async () => {
      const request = new Request('http://localhost/api/csrf', {
        method: 'GET'
      });

      const ctx = {
        request,
        locals: { 
          runtime: { env },
          user: { sub: userId, email: 'test@example.com', name: 'Test User' }
        }
      };

      const res = await getCSRFToken(ctx);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.token).toBeDefined();
      expect(data.expires).toBeGreaterThan(Date.now());
      expect(data.expiresIn).toBeGreaterThan(0);
      
      // Verify the token is valid
      const isValid = verifyCSRFToken(data.token, userId, jwtSecret);
      expect(isValid).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      const request = new Request('http://localhost/api/csrf', {
        method: 'GET'
      });

      const ctx = {
        request,
        locals: { 
          runtime: { env },
          user: null // Not authenticated
        }
      };

      const res = await getCSRFToken(ctx);
      expect(res.status).toBe(401);
    });

    it('should include no-cache headers', async () => {
      const request = new Request('http://localhost/api/csrf', {
        method: 'GET'
      });

      const ctx = {
        request,
        locals: { 
          runtime: { env },
          user: { sub: userId, email: 'test@example.com', name: 'Test User' }
        }
      };

      const res = await getCSRFToken(ctx);
      expect(res.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
      expect(res.headers.get('Pragma')).toBe('no-cache');
    });
  });
});
