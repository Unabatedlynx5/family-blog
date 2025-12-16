import { describe, it, expect, beforeEach } from 'vitest';

class MockDB {
  constructor() {
    this.posts = [];
    this.users = [{
      id: 'user1',
      name: 'Test User',
      email: 'test@example.com'
    }];
  }

  prepare(sql) {
    return {
      bind: (...args) => ({
        all: async () => {
          if (sql.includes('SELECT p.*, u.name')) {
            const limit = args[0];
            const offset = args[1];
            const results = this.posts
              .map(p => ({
                ...p,
                name: this.users.find(u => u.id === p.user_id)?.name || 'Unknown',
                email: this.users.find(u => u.id === p.user_id)?.email || ''
              }))
              .slice(offset, offset + limit);
            return { results };
          }
          return { results: [] };
        }
      })
    };
  }
}

const mockEnv = {
  DB: null
};

describe('Feed API', () => {
  beforeEach(() => {
    mockEnv.DB = new MockDB();
  });

  describe('GET /api/feed', () => {
    it('should return empty feed initially', async () => {
      const { get } = await import('../functions/api/feed.js');
      
      const request = new Request('http://localhost/api/feed');
      const response = await get({ request, env: mockEnv });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.posts).toEqual([]);
      expect(data.nextCursor).toBe(null);
    });

    it('should return posts with user information', async () => {
      // Add some posts
      mockEnv.DB.posts.push({
        id: 'post1',
        user_id: 'user1',
        content: 'First post',
        media_refs: '[]',
        source: 'ui',
        created_at: Date.now()
      });
      
      const { get } = await import('../functions/api/feed.js');
      const request = new Request('http://localhost/api/feed');
      const response = await get({ request, env: mockEnv });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.posts).toHaveLength(1);
      expect(data.posts[0].name).toBe('Test User');
      expect(data.posts[0].content).toBe('First post');
    });

    it('should parse media_refs JSON', async () => {
      mockEnv.DB.posts.push({
        id: 'post1',
        user_id: 'user1',
        content: 'Post with media',
        media_refs: JSON.stringify(['key1', 'key2']),
        source: 'ui',
        created_at: Date.now()
      });
      
      const { get } = await import('../functions/api/feed.js');
      const request = new Request('http://localhost/api/feed');
      const response = await get({ request, env: mockEnv });
      
      const data = await response.json();
      expect(data.posts[0].media_refs).toEqual(['key1', 'key2']);
    });

    it('should respect limit parameter', async () => {
      // Add 10 posts
      for (let i = 0; i < 10; i++) {
        mockEnv.DB.posts.push({
          id: `post${i}`,
          user_id: 'user1',
          content: `Post ${i}`,
          media_refs: '[]',
          source: 'ui',
          created_at: Date.now() + i
        });
      }
      
      const { get } = await import('../functions/api/feed.js');
      const request = new Request('http://localhost/api/feed?limit=5');
      const response = await get({ request, env: mockEnv });
      
      const data = await response.json();
      expect(data.posts).toHaveLength(5);
      expect(data.nextCursor).toBe(5);
    });

    it('should support pagination with cursor', async () => {
      // Add 15 posts
      for (let i = 0; i < 15; i++) {
        mockEnv.DB.posts.push({
          id: `post${i}`,
          user_id: 'user1',
          content: `Post ${i}`,
          media_refs: '[]',
          source: 'ui',
          created_at: Date.now() + i
        });
      }
      
      const { get } = await import('../functions/api/feed.js');
      
      // First page
      const request1 = new Request('http://localhost/api/feed?limit=5&cursor=0');
      const response1 = await get({ request: request1, env: mockEnv });
      const data1 = await response1.json();
      
      expect(data1.posts).toHaveLength(5);
      expect(data1.posts[0].id).toBe('post0');
      
      // Second page
      const request2 = new Request('http://localhost/api/feed?limit=5&cursor=5');
      const response2 = await get({ request: request2, env: mockEnv });
      const data2 = await response2.json();
      
      expect(data2.posts).toHaveLength(5);
      expect(data2.posts[0].id).toBe('post5');
    });

    it('should return null cursor when no more posts', async () => {
      // Add 5 posts
      for (let i = 0; i < 5; i++) {
        mockEnv.DB.posts.push({
          id: `post${i}`,
          user_id: 'user1',
          content: `Post ${i}`,
          media_refs: '[]',
          source: 'ui',
          created_at: Date.now() + i
        });
      }
      
      const { get } = await import('../functions/api/feed.js');
      const request = new Request('http://localhost/api/feed?limit=10');
      const response = await get({ request, env: mockEnv });
      
      const data = await response.json();
      expect(data.posts).toHaveLength(5);
      expect(data.nextCursor).toBe(null);
    });

    it('should handle empty media_refs gracefully', async () => {
      mockEnv.DB.posts.push({
        id: 'post1',
        user_id: 'user1',
        content: 'Post without media',
        media_refs: null,
        source: 'ui',
        created_at: Date.now()
      });
      
      const { get } = await import('../functions/api/feed.js');
      const request = new Request('http://localhost/api/feed');
      const response = await get({ request, env: mockEnv });
      
      const data = await response.json();
      expect(data.posts[0].media_refs).toEqual([]);
    });

    it('should default limit to 50', async () => {
      const { get } = await import('../functions/api/feed.js');
      const request = new Request('http://localhost/api/feed');
      
      // This test just verifies the request succeeds with default limit
      const response = await get({ request, env: mockEnv });
      expect(response.status).toBe(200);
    });

    it('should set correct content-type header', async () => {
      const { get } = await import('../functions/api/feed.js');
      const request = new Request('http://localhost/api/feed');
      const response = await get({ request, env: mockEnv });
      
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });
});
