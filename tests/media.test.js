
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { POST as uploadMedia } from '../src/pages/api/media/upload';
import { GET as getMedia } from '../src/pages/api/media/[id]';

// Mock D1 Database using better-sqlite3
class MockD1Database {
  constructor(db) {
    this.db = db;
  }

  prepare(query) {
    const stmt = this.db.prepare(query);
    return {
      bind: (...args) => {
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
      }
    };
  }
}

// Mock R2 Bucket
class MockR2Bucket {
  constructor() {
    this.storage = new Map();
  }

  async put(key, value, options) {
    this.storage.set(key, { value, options });
    return { key };
  }

  async get(key) {
    const item = this.storage.get(key);
    if (!item) return null;
    return {
      body: item.value,
      httpMetadata: item.options?.httpMetadata
    };
  }
}

describe('Media API Tests', () => {
  let db;
  let env;
  let mockLocals;
  let validToken;
  let userId;

  beforeEach(() => {
    // Setup in-memory DB
    const sqlite = new Database(':memory:');
    
    // Apply migrations
    const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/001_init.sql'), 'utf-8');
    sqlite.exec(migration);

    db = new MockD1Database(sqlite);
    
    env = {
      DB: db,
      MEDIA: new MockR2Bucket(),
      JWT_SECRET: 'test-secret'
    };

    // Create a user
    userId = 'user-123';
    sqlite.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, 'user@example.com', 'hash', 'Test User', 1, Date.now());

    mockLocals = {
      runtime: { env },
      user: { sub: userId, email: 'user@example.com', name: 'Test User' }
    };

    // Generate valid token
    validToken = jwt.sign({ sub: userId, email: 'user@example.com' }, 'test-secret', { expiresIn: '1h' });
  });

  it('should upload an image', async () => {
    const formData = new FormData();
    const fileContent = new Uint8Array([1, 2, 3, 4]);
    const file = new File([fileContent], 'test.png', { type: 'image/png' });
    formData.append('file', file);

    const req = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validToken}`
      },
      body: formData
    });

    const res = await uploadMedia({ request: req, locals: mockLocals, cookies: { get: () => undefined } });
    expect(res.status).toBe(201);
    
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.media.filename).toBe('test.png');
    expect(data.media.content_type).toBe('image/png');

    // Verify in DB
    const media = env.DB.db.prepare('SELECT * FROM media WHERE id = ?').get(data.media.id);
    expect(media).toBeDefined();
    expect(media.mime_type).toBe('image/png');
    expect(media.uploader_id).toBe(userId);

    // Verify in R2
    const r2Object = await env.MEDIA.get(media.r2_key);
    expect(r2Object).toBeDefined();
  });

  it('should fail to upload invalid file type', async () => {
    const formData = new FormData();
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    formData.append('file', file);

    const req = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validToken}`
      },
      body: formData
    });

    const res = await uploadMedia({ request: req, locals: mockLocals, cookies: { get: () => undefined } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid file type');
  });

  it('should get media by id', async () => {
    // Manually insert media
    const mediaId = 'media-123';
    const r2Key = `media/${userId}/${mediaId}.png`;
    const now = Math.floor(Date.now() / 1000);
    
    env.DB.db.prepare('INSERT INTO media (id, uploader_id, r2_key, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(mediaId, userId, r2Key, 'image/png', 100, now);
    
    await env.MEDIA.put(r2Key, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/png' } });

    const req = new Request(`http://localhost/api/media/${mediaId}`);
    
    const res = await getMedia({ params: { id: mediaId }, locals: mockLocals, request: req });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
  });

  it('should return 404 for non-existent media', async () => {
    const req = new Request('http://localhost/api/media/non-existent');
    
    const res = await getMedia({ params: { id: 'non-existent' }, locals: mockLocals, request: req });
    expect(res.status).toBe(404);
  });

  it('should reject unauthorized upload', async () => {
    const req = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      body: new FormData()
    });
    
    // No user in locals
    const res = await uploadMedia({ request: req, locals: { runtime: { env } }, cookies: { get: () => undefined } });
    expect(res.status).toBe(401);
  });

  it('should reject upload with no file', async () => {
    const formData = new FormData();
    // No file appended

    const req = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      body: formData
    });

    const res = await uploadMedia({ request: req, locals: mockLocals, cookies: { get: () => undefined } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('No file provided');
  });

  it('should reject file too large', async () => {
    // Mock request.formData() to return a file with large size
    const req = new Request('http://localhost/api/media/upload', {
      method: 'POST'
    });

    const mockFile = {
      name: 'large.png',
      type: 'image/png',
      size: 5 * 1024 * 1024 + 1,
      arrayBuffer: async () => new ArrayBuffer(0)
    };

    req.formData = async () => {
      const map = new Map();
      map.get = (key) => key === 'file' ? mockFile : null;
      return map;
    };

    const res = await uploadMedia({ request: req, locals: mockLocals, cookies: { get: () => undefined } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('File too large');
  });

  it('should handle R2 upload failure', async () => {
    const formData = new FormData();
    const file = new File(['content'], 'test.png', { type: 'image/png' });
    formData.append('file', file);

    const req = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      body: formData
    });

    // Mock R2 failure
    env.MEDIA.put = vi.fn().mockRejectedValue(new Error('R2 Error'));

    const res = await uploadMedia({ request: req, locals: mockLocals, cookies: { get: () => undefined } });
    expect(res.status).toBe(500);
  });
});
