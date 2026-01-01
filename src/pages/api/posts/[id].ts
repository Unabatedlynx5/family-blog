/**
 * Single post endpoint
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - UUID validation for post ID
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../../types/cloudflare';
import { isValidUUID } from '../../../types/cloudflare';

export const prerender = false;

/** Post row from database */
interface DBPostRow {
  id: string;
  user_id: string;
  content: string;
  media_refs: string | null;
  created_at: number;
  likes: string | null;
  name: string;
  email: string;
}

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  const postId = params.id;

  if (!postId) {
    return new Response(JSON.stringify({ error: 'Post ID required' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Security: Validate UUID format
  if (!isValidUUID(postId)) {
    return new Response(JSON.stringify({ error: 'Invalid post ID format' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const post = await env.DB.prepare(`
      SELECT 
        p.id,
        p.user_id,
        p.content,
        p.media_refs,
        p.created_at,
        p.likes,
        u.name,
        u.email
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).bind(postId).first<DBPostRow>();

    if (!post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse likes
    let like_count = 0;
    let user_has_liked = 0;
    const currentUserId = locals.user?.sub;
    
    try {
      const likesArray = JSON.parse(post.likes || '[]');
      if (Array.isArray(likesArray)) {
        like_count = likesArray.length;
        if (currentUserId && likesArray.includes(currentUserId)) {
          user_has_liked = 1;
        }
      }
    } catch {
      // ignore parse error
    }

    const mediaRefs = (() => {
      try {
        return post.media_refs ? JSON.parse(post.media_refs) : [];
      } catch {
        return [];
      }
    })();

    const media_urls = Array.isArray(mediaRefs)
      ? mediaRefs.map((id: string) => `/api/media/${id}`)
      : [];

    // Build response object without mutating original
    const responsePost = {
      id: post.id,
      user_id: post.user_id,
      content: post.content,
      created_at: post.created_at,
      name: post.name,
      email: post.email,
      media_urls,
      like_count,
      user_has_liked
    };

    return new Response(
      JSON.stringify({ post: responsePost }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Get post error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
