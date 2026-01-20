
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST as uploadMedia } from '../../src/pages/api/media/upload.ts';
// import { GET as getMedia } from '../../src/pages/api/media/[id].ts'; // This file likely doesn't exist based on workspace info, or it needs to be located.
// Workspace info shows: src/pages/api/media/upload.ts. It doesn't show [id].ts in the truncated list, or I missed it.
// I will check file existence later. For now, porting upload.

describe('Media API Integration', () => {
  let env;
  let mockLocals;
  let userId;

  beforeEach(async () => {
    env = globalThis.testEnv;
    userId = 'media-user-1';
    
    // Seed User
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(userId, 'media@example.com', 'hash', 'Media User', 1, Date.now())
      .run();

    mockLocals = {
      runtime: { env },
      user: { sub: userId, email: 'media@example.com', name: 'Media User' }
    };
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

  it('should reject unauthorized upload', async () => {
    const req = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      body: new FormData()
    });
    
    // No user in locals
    mockLocals.user = null;
    const res = await uploadMedia({ request: req, locals: mockLocals });
    expect(res.status).toBe(401);
  });
});
