import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET as getFeed } from '../src/pages/api/feed';
import { applyMigrations } from './utils/db';
import { setupMiniflare } from './utils/miniflare';
import { createMockContext } from './utils/mocks';

// Mock astro:content
vi.mock('astro:content', () => ({
  getCollection: vi.fn().mockResolvedValue([
    {
      id: 'post-1',
      body: 'Markdown Content 1',
      data: {
        title: 'Markdown Post 1',
        pubDate: new Date('2023-01-01T12:00:00Z'),
        heroImage: '/images/hero.jpg'
      }
    },
    {
      id: 'post-2',
      body: 'Markdown Content 2',
      data: {
        title: 'Markdown Post 2',
        pubDate: new Date('2023-01-02T12:00:00Z')
      }
    }
  ])
}));

describe('Feed API Tests', () => {
  let mf;
  let env;
  let mockLocals;
  let userId;

  beforeEach(async () => {
    const setup = await setupMiniflare();
    mf = setup.mf;
    env = setup.env;
    
    await applyMigrations(env.DB);

    userId = 'user-123';
    mockLocals = createMockContext(env, { 
      sub: userId, 
      email: 'user@example.com', 
      name: 'Test User' 
    });

    // Insert some DB posts
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(userId, 'user@example.com', 'hash', 'Test User', 1, Date.now())
      .run();

    // DB Post 1 (Newer than MD posts)
    await env.DB.prepare('INSERT INTO posts (id, user_id, content, created_at, likes) VALUES (?, ?, ?, ?, ?)')
      .bind('db-post-1', userId, 'DB Content 1', Math.floor(new Date('2023-01-03T12:00:00Z').getTime() / 1000), '[]')
      .run();

    // DB Post 2 (Older than MD Post 2, Newer than MD Post 1)
    await env.DB.prepare('INSERT INTO posts (id, user_id, content, created_at, likes) VALUES (?, ?, ?, ?, ?)')
      .bind('db-post-2', userId, 'DB Content 2', Math.floor(new Date('2023-01-01T15:00:00Z').getTime() / 1000), JSON.stringify([userId]))
      .run();
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it('should return merged and sorted feed', async () => {
    const req = new Request('http://localhost/api/feed');
    const url = new URL('http://localhost/api/feed');
    
    const res = await getFeed({ locals: mockLocals, url, request: req });
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.posts).toHaveLength(4); // 2 MD + 2 DB

    // Expected Order (Newest first):
    // 1. DB Post 1 (Jan 3)
    // 2. MD Post 2 (Jan 2)
    // 3. DB Post 2 (Jan 1 15:00)
    // 4. MD Post 1 (Jan 1 12:00)

    expect(data.posts[0].id).toBe('db-post-1');
    expect(data.posts[1].id).toBe('md-post-2');
    expect(data.posts[2].id).toBe('db-post-2');
    expect(data.posts[3].id).toBe('md-post-1');
  });

  it('should handle pagination', async () => {
    // Page 1, Limit 2
    const req1 = new Request('http://localhost/api/feed?page=1&limit=2');
    const url1 = new URL('http://localhost/api/feed?page=1&limit=2');
    
    const res1 = await getFeed({ locals: mockLocals, url: url1, request: req1 });
    const data1 = await res1.json();
    
    expect(data1.posts).toHaveLength(2);
    expect(data1.posts[0].id).toBe('db-post-1');
    expect(data1.posts[1].id).toBe('md-post-2');

    // Page 2, Limit 2
    const req2 = new Request('http://localhost/api/feed?page=2&limit=2');
    const url2 = new URL('http://localhost/api/feed?page=2&limit=2');
    
    const res2 = await getFeed({ locals: mockLocals, url: url2, request: req2 });
    const data2 = await res2.json();
    
    expect(data2.posts).toHaveLength(2);
    expect(data2.posts[0].id).toBe('db-post-2');
    expect(data2.posts[1].id).toBe('md-post-1');
  });

  it('should correctly parse likes', async () => {
    const req = new Request('http://localhost/api/feed');
    const url = new URL('http://localhost/api/feed');
    
    const res = await getFeed({ locals: mockLocals, url, request: req });
    const data = await res.json();
    
    // db-post-1 has no likes
    const post1 = data.posts.find(p => p.id === 'db-post-1');
    expect(post1.like_count).toBe(0);
    expect(post1.user_has_liked).toBe(0);

    // db-post-2 has 1 like from current user
    const post2 = data.posts.find(p => p.id === 'db-post-2');
    expect(post2.like_count).toBe(1);
    expect(post2.user_has_liked).toBe(1);
  });
});
