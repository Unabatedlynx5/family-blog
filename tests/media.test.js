import { describe, it, expect, beforeEach } from 'vitest';

class MockR2 {
  constructor() {
    this.storage = new Map();
  }

  async put(key, value) {
    this.storage.set(key, value);
    return { key };
  }

  async get(key) {
    return this.storage.get(key);
  }

  async delete(key) {
    return this.storage.delete(key);
  }
}

class MockDB {
  constructor() {
    this.media = [];
  }

  prepare(sql) {
    return {
      bind: (...args) => ({
        run: async () => {
          if (sql.includes('INSERT INTO media')) {
            this.media.push({
              id: args[0],
              uploader_id: args[1],
              r2_key: args[2],
              mime_type: args[3],
              size: args[4],
              created_at: args[5]
            });
          }
          return { success: true };
        }
      })
    };
  }
}

const mockEnv = {
  JWT_SECRET: 'test-secret',
  MEDIA: null,
  DB: null
};

describe('Media Upload API', () => {
  beforeEach(() => {
    mockEnv.MEDIA = new MockR2();
    mockEnv.DB = new MockDB();
  });

  describe('POST /api/media/upload', () => {
    it('should upload media with valid auth', async () => {
      const { createAccessToken } = await import('../workers/utils/auth.js');
      const { post } = await import('../functions/api/media/upload.js');
      
      const token = createAccessToken({ sub: 'user1' }, mockEnv);
      const imageData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]); // Fake JPEG header
      
      const request = new Request('http://localhost/api/media/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/octet-stream'
        },
        body: imageData
      });
      
      const response = await post({ request, env: mockEnv });
      expect(response.status).toBe(201);
      
      const data = await response.json();
      expect(data.key).toBeDefined();
      expect(mockEnv.MEDIA.storage.size).toBe(1);
      expect(mockEnv.DB.media).toHaveLength(1);
    });

    it('should reject upload without authorization', async () => {
      const { post } = await import('../functions/api/media/upload.js');
      
      const request = new Request('http://localhost/api/media/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        body: new Uint8Array([0xFF, 0xD8])
      });
      
      const response = await post({ request, env: mockEnv });
      expect(response.status).toBe(401);
    });

    it('should reject upload with invalid content type', async () => {
      const { createAccessToken } = await import('../workers/utils/auth.js');
      const { post } = await import('../functions/api/media/upload.js');
      
      const token = createAccessToken({ sub: 'user1' }, mockEnv);
      
      const request = new Request('http://localhost/api/media/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain'
        },
        body: 'some text'
      });
      
      const response = await post({ request, env: mockEnv });
      expect(response.status).toBe(400);
    });

    it('should accept multipart/form-data content type', async () => {
      const { createAccessToken } = await import('../workers/utils/auth.js');
      const { post } = await import('../functions/api/media/upload.js');
      
      const token = createAccessToken({ sub: 'user1' }, mockEnv);
      
      const request = new Request('http://localhost/api/media/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary'
        },
        body: new Uint8Array([0xFF, 0xD8])
      });
      
      const response = await post({ request, env: mockEnv });
      expect(response.status).toBe(201);
    });

    it('should store media metadata in database', async () => {
      const { createAccessToken } = await import('../workers/utils/auth.js');
      const { post } = await import('../functions/api/media/upload.js');
      
      const token = createAccessToken({ sub: 'user123' }, mockEnv);
      const imageData = new Uint8Array(1024); // 1KB file
      
      const request = new Request('http://localhost/api/media/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/octet-stream'
        },
        body: imageData
      });
      
      await post({ request, env: mockEnv });
      
      expect(mockEnv.DB.media).toHaveLength(1);
      const metadata = mockEnv.DB.media[0];
      expect(metadata.uploader_id).toBe('user123');
      expect(metadata.r2_key).toBeDefined();
      expect(metadata.size).toBe(1024);
    });

    it('should generate unique keys for each upload', async () => {
      const { createAccessToken } = await import('../workers/utils/auth.js');
      const { post } = await import('../functions/api/media/upload.js');
      
      const token = createAccessToken({ sub: 'user1' }, mockEnv);
      const imageData = new Uint8Array([0xFF, 0xD8]);
      
      const keys = [];
      
      for (let i = 0; i < 3; i++) {
        const request = new Request('http://localhost/api/media/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/octet-stream'
          },
          body: imageData
        });
        
        const response = await post({ request, env: mockEnv });
        const data = await response.json();
        keys.push(data.key);
      }
      
      // All keys should be unique
      expect(new Set(keys).size).toBe(3);
    });
  });
});
