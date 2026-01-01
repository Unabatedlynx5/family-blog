import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { GET as getMembers } from '../src/pages/api/members/index';

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

describe('Members API Tests', () => {
  let db;
  let env;
  let mockLocals;
  const testUserId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    const sqlite = new Database(':memory:');
    const migrationsDir = path.resolve(__dirname, '../migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).sort();
    for (const file of migrationFiles) {
        if (file.endsWith('.sql')) {
            const migration = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
            sqlite.exec(migration);
        }
    }

    db = new MockD1Database(sqlite);
    env = { DB: db };
    // Add mock user for authentication
    mockLocals = { 
      runtime: { env },
      user: { sub: testUserId, email: 'test@example.com', name: 'Test User', role: 'user' }
    };
  });

  it('GET /api/members should return active members', async () => {
    const now = Math.floor(Date.now() / 1000);
    // Insert active user
    db.db.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('550e8400-e29b-41d4-a716-446655440001', 'active@example.com', 'hash', 'Active User', 1, now, now);
    
    // Insert inactive user (last seen > 2 mins ago)
    db.db.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('550e8400-e29b-41d4-a716-446655440002', 'inactive@example.com', 'hash', 'Inactive User', 1, now, now - 300);

    const res = await getMembers({ locals: mockLocals });
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.active).toBe(1);
    expect(data.members).toHaveLength(1);
    expect(data.members[0].name).toBe('Active User');
  });
});
