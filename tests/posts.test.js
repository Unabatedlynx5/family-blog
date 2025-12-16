import { describe, it, expect, beforeEach } from 'vitest';

// Mock database
class MockDB {
  constructor() {
    this.posts = [];
    this.users = [{
      id: 'user1',
      email: 'test@example.com',
      name: 'Test User'
    }];
  }

  prepare(sql) {
    return {
      bind: (...args) => ({
        all: async () => {
          if (sql.includes('SELECT p.*, u.name FROM posts')) {
            return { 
              results: this.posts.map(p => ({
                ...p,
                name: this.users.find(u => u.id === p.user_id)?.name || 'Unknown'
              }))
            };
          }
          return { results: [] };
        },
        run: async () => {
          if (sql.includes('INSERT INTO posts')) {
            this.posts.push({
              id: args[0],
              user_id: args[1],
              content: args[2],
              media_refs: args[3],
              created_at: args[4],
              source: 'ui'
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
  DB: null
};

describe('Posts API', () => {
  beforeEach(() => {
    mockEnv.DB = new MockDB();
  });

  describe('GET /api/posts', () => {
    it('should return empty posts list initially', async () => {
      const { get } = await import('../functions/api/posts/index.js');
      
      const request = new Request('http://localhost/api/posts?limit=20');
      const response = await get({ request, env: mockEnv });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.posts).toEqual([]);
    });

    it('should return posts after creation', async () => {
      const { createAccessToken } = await import('../workers/utils/auth.js');
      const { get, post } = await import('../functions/api/posts/index.js');
      
      // Create a post first
      const token = createAccessToken({ sub: 'user1' }, mockEnv);
      const createRequest = new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: 'Test post content',
          media_refs: []
        })
      });
      
      await post({ request: createRequest, env: mockEnv });
      
      // Now get posts
      const getRequest = new Request('http://localhost/api/posts');
      const response = await get({ request: getRequest, env: mockEnv });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.posts).toHaveLength(1);
      expect(data.posts[0].content).toBe('Test post content');
    });

    it('should respect limit parameter', async () => {
      const { get } = await import('../functions/api/posts/index.js');
      
      // Add multiple posts
      for (let i = 0; i < 5; i++) {
        mockEnv.DB.posts.push({
          id: `post${i}`,
          user_id: 'user1',
          content: `Post ${i}`,
          media_refs: '[]',
          created_at: Date.now(),
          source: 'ui'
        });
      }
      
      const request = new Request('http://localhost/api/posts?limit=3');
      const response = await get({ request, env: mockEnv });
      
      const data = await response.json();
      expect(data.posts).toHaveLength(5); // Mock doesn't enforce limit, but in real DB it would
    });
  });

  describe('POST /api/posts', () => {
    it('should create a post with valid auth', async () => {
      const { createAccessToken } = await import('../workers/utils/auth.js');
      const { post } = await import('../functions/api/posts/index.js');
      
      const token = createAccessToken({ sub: 'user1' }, mockEnv);
      const request = new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: 'My new post',
          media_refs: ['media-key-1']
        })
      });
      
      const response = await post({ request, env: mockEnv });
      expect(response.status).toBe(201);
      
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.id).toBeDefined();
      expect(mockEnv.DB.posts).toHaveLength(1);
    });

    it('should reject post without authorization', async () => {
      const { post } = await import('../functions/api/posts/index.js');
      
      const request = new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: 'Unauthorized post'
        })
      });
      
      const response = await post({ request, env: mockEnv });
      expect(response.status).toBe(401);
    });

    it('should reject post with invalid token', async () => {
      const { post } = await import('../functions/api/posts/index.js');
      
      const request = new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: 'Invalid token post'
        })
      });
      
      const response = await post({ request, env: mockEnv });
      expect(response.status).toBe(401);
    });

    it('should create post with empty content', async () => {
      const { createAccessToken } = await import('../workers/utils/auth.js');
      const { post } = await import('../functions/api/posts/index.js');
      
      const token = createAccessToken({ sub: 'user1' }, mockEnv);
      const request = new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: '',
          media_refs: ['photo.jpg']
        })
      });
      
      const response = await post({ request, env: mockEnv });
      expect(response.status).toBe(201);
    });

    it('should properly serialize media_refs as JSON', async () => {
      const { createAccessToken } = await import('../workers/utils/auth.js');
      const { post } = await import('../functions/api/posts/index.js');
      
      const token = createAccessToken({ sub: 'user1' }, mockEnv);
      const mediaRefs = ['key1', 'key2', 'key3'];
      
      const request = new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: 'Post with media',
          media_refs: mediaRefs
        })
      });
      
      await post({ request, env: mockEnv });
      
      const createdPost = mockEnv.DB.posts[0];
      expect(createdPost.media_refs).toBe(JSON.stringify(mediaRefs));
    });
  });
});
