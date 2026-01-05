import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST as uploadMedia } from '../src/pages/api/media/upload';
import { GET as getMedia } from '../src/pages/api/media/[id]';
import { applyMigrations } from './utils/db';
import { setupMiniflare } from './utils/miniflare';
import { createMockContext } from './utils/mocks';

describe('Media API Tests', () => {
  let mf;
  let env;
  let mockLocals;
  let userId;

  beforeEach(async () => {
    const setup = await setupMiniflare();
    mf = setup.mf;
    env = setup.env;
    
    await applyMigrations(env.DB);

    // Create a user
    userId = 'user-123';
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(userId, 'user@example.com', 'hash', 'Test User', 1, Date.now())
      .run();

    mockLocals = createMockContext(env, { 
      sub: userId, 
      email: 'user@example.com', 
      name: 'Test User' 
    });
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it('should upload an image', async () => {
    const formData = new FormData();
    const fileContent = new Uint8Array([1, 2, 3, 4]);
    const file = new File([fileContent], 'test.png', { type: 'image/png' });
    formData.append('file', file);

    const req = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      body: formData
    });

    const res = await uploadMedia({ request: req, locals: mockLocals });
    expect(res.status).toBe(201);
    
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.media.filename).toBe('test.png');
    expect(data.media.content_type).toBe('image/png');

    // Verify in DB
    const media = await env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(data.media.id).first();
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
      body: formData
    });

    const res = await uploadMedia({ request: req, locals: mockLocals });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid file type');
  });

  it('should get media by id', async () => {
    // Manually insert media
    const mediaId = 'media-123';
    const r2Key = `media/${userId}/${mediaId}.png`;
    const now = Math.floor(Date.now() / 1000);
    
    await env.DB.prepare('INSERT INTO media (id, uploader_id, r2_key, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(mediaId, userId, r2Key, 'image/png', 100, now)
      .run();
    
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
    const res = await uploadMedia({ request: req, locals: createMockContext(env) });
    expect(res.status).toBe(401);
  });

  it('should reject upload with no file', async () => {
    const formData = new FormData();
    // No file appended

    const req = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      body: formData
    });

    const res = await uploadMedia({ request: req, locals: mockLocals });
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

    const res = await uploadMedia({ request: req, locals: mockLocals });
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
    const originalPut = env.MEDIA.put;
    // Create a new object with the mocked put method to ensure it's used
    const mockMedia = {
      ...env.MEDIA,
      put: vi.fn().mockRejectedValue(new Error('R2 Error')),
      get: env.MEDIA.get.bind(env.MEDIA) // Bind other methods if needed
    };
    
    // We need to modify the env object that is passed to the handler
    // Since mockLocals.runtime.env is a reference to env, modifying env.MEDIA should work
    // UNLESS env.MEDIA is read-only.
    
    // Let's try to force replace it on the env object
    Object.defineProperty(env, 'MEDIA', {
      value: mockMedia,
      writable: true
    });

    try {
      const res = await uploadMedia({ request: req, locals: mockLocals });
      expect(res.status).toBe(500);
    } finally {
      // Restore
      Object.defineProperty(env, 'MEDIA', {
        value: { ...mockMedia, put: originalPut }, // Restore original put
        writable: true
      });
    }
  });
});
