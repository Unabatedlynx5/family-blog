
import { describe, it, expect, beforeEach } from 'vitest';
import { POST as toggleLike } from '../../src/pages/api/likes.ts';
import { sign } from 'jsonwebtoken';

describe('Likes API Integration', () => {
    let env;
    let mockLocals;

    beforeEach(async () => {
        env = globalThis.testEnv;
        env.JWT_SECRET = 'test-jwt-secret';
        
        // Setup User (Author)
        await env.DB.prepare(`
            INSERT INTO users (id, email, password_hash, name, role, created_at, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, 1)
        `).bind('author-1', 'author@test.com', 'hash', 'Author', 'user', Math.floor(Date.now()/1000)).run();
        
        // Setup Post
        await env.DB.prepare(`
            INSERT INTO posts (id, user_id, content, likes, created_at) 
            VALUES (?, ?, ?, ?, ?)
        `).bind('post-1', 'author-1', 'Hello World', '[]', Math.floor(Date.now()/1000)).run();

        // Helper for context creation
    });

    const createRequest = (userId, targetId) => {
        const token = sign({ sub: userId, email: `${userId}@example.com` }, 'test-jwt-secret');
        
        const req = new Request('http://localhost/api/likes', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ target_id: targetId, target_type: 'post' })
        });
        
        return {
            request: req,
            locals: {
                runtime: { env },
                user: {
                    sub: userId,
                    email: `${userId}@example.com`,
                    name: userId,
                    role: 'user'
                }
            },
            cookies: {
                get: (name) => name === 'accessToken' ? { value: token } : undefined
            }
        };
    };

    it('should correctly handle multiple users liking and unliking', async () => {
        const userA = 'user-A';
        const userB = 'user-B';
        const postId = 'post-1';

        // 1. User A likes
        const ctxA = createRequest(userA, postId);
        let res = await toggleLike(ctxA);
        let data = await res.json();
        
        expect(res.status).toBe(200);
        expect(data.liked).toBe(true);
        expect(data.count).toBe(1);

        // Verify DB
        let post = await env.DB.prepare('SELECT likes FROM posts WHERE id = ?').bind(postId).first();
        let likes = JSON.parse(post.likes);
        expect(likes).toContain(userA);
        expect(likes.length).toBe(1);

        // 2. User B likes
        const ctxB = createRequest(userB, postId);
        res = await toggleLike(ctxB);
        data = await res.json();

        expect(res.status).toBe(200);
        expect(data.liked).toBe(true);
        expect(data.count).toBe(2);

        post = await env.DB.prepare('SELECT likes FROM posts WHERE id = ?').bind(postId).first();
        likes = JSON.parse(post.likes);
        expect(likes).toContain(userA);
        expect(likes).toContain(userB);

        // 3. User A unlikes
        const ctxA2 = createRequest(userA, postId);
        res = await toggleLike(ctxA2);
        data = await res.json();
        
        expect(res.status).toBe(200);
        expect(data.liked).toBe(false);
        expect(data.count).toBe(1);
        
        post = await env.DB.prepare('SELECT likes FROM posts WHERE id = ?').bind(postId).first();
        likes = JSON.parse(post.likes);
        expect(likes).not.toContain(userA);
        expect(likes).toContain(userB);
    });

    it('should handle invalid JSON in likes column gracefully', async () => {
        // Corrupt matches DB
        // D1 might strict type, but text column allows anything.
        await env.DB.prepare("UPDATE posts SET likes = 'invalid-json' WHERE id = ?").bind('post-1').run();

        const userA = 'user-A';
        const ctx = createRequest(userA, 'post-1');
        
        const res = await toggleLike(ctx);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.liked).toBe(true);
        // It should reset to [userA], so count 1
        expect(data.count).toBe(1);
    });

    it('should return 404 for non-existent post', async () => {
        const ctx = createRequest('user-A', 'post-999');
        const res = await toggleLike(ctx);
        expect(res.status).toBe(404);
    });
});
