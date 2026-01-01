/**
 * Likes API endpoint for posts
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - CRITICAL Issue #1: Rate limiting for likes
 * - MEDIUM Issue #21: UUID validation for target_id
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../types/cloudflare.ts';
import { CONFIG, isValidUUID } from '../../types/cloudflare.ts';
import { isRateLimited, getRateLimitInfo, createRateLimitResponse } from '../../../workers/utils/rate-limit.ts';
import { requireAuth } from '../../../workers/utils/validation.ts';

export const prerender = false;

/** Request body for like action */
interface LikeRequestBody {
  target_id: string;
  target_type: string;
}

/** Database row for post likes */
interface PostLikesRow {
  likes: string | null;
}

/** Allowed target types for likes */
const ALLOWED_TARGET_TYPES = ['post'] as const;
type TargetType = typeof ALLOWED_TARGET_TYPES[number];

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Check authentication via middleware
  const authError = requireAuth(locals.user);
  if (authError) return authError;
  
  const userId = locals.user!.sub;
  
  // Security: Rate limiting - 100 likes per hour per user
  // CRITICAL Issue #1 Fix
  const rateLimitKey = `like:${userId}`;
  if (isRateLimited(rateLimitKey, CONFIG.rateLimit.likeMaxRequests, CONFIG.rateLimit.likeWindowMs)) {
    const info = getRateLimitInfo(rateLimitKey, CONFIG.rateLimit.likeMaxRequests);
    return createRateLimitResponse(info, 'Like limit reached. Please try again later.');
  }

  try {
    const body = await request.json() as LikeRequestBody;
    const { target_id, target_type } = body;

    // Validate required fields
    if (!target_id || !target_type) {
      return new Response(JSON.stringify({ error: 'Target ID and type required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Security: Validate UUID format
    // MEDIUM Issue #21 Fix
    if (!isValidUUID(target_id)) {
      return new Response(JSON.stringify({ error: 'Invalid target ID format' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate target type
    if (!ALLOWED_TARGET_TYPES.includes(target_type as TargetType)) {
      return new Response(JSON.stringify({ error: 'Invalid target type' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch current likes array
    const post = await env.DB.prepare('SELECT likes FROM posts WHERE id = ?')
      .bind(target_id)
      .first<PostLikesRow>();
    
    if (!post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let likesArray: string[] = [];
    try {
      likesArray = JSON.parse(post.likes || '[]');
      if (!Array.isArray(likesArray)) likesArray = [];
    } catch {
      likesArray = [];
    }

    const index = likesArray.indexOf(userId);
    let liked = false;

    if (index > -1) {
      // Unlike: Remove user ID
      likesArray.splice(index, 1);
      liked = false;
    } else {
      // Like: Add user ID
      likesArray.push(userId);
      liked = true;
    }

    const newLikesJson = JSON.stringify(likesArray);
    const newCount = likesArray.length;

    // Update DB
    await env.DB.prepare('UPDATE posts SET likes = ? WHERE id = ?')
      .bind(newLikesJson, target_id)
      .run();

    // Notify Durable Object (Global Feed Room) - fire and forget
    try {
      const doId = env.POST_ROOM.idFromName('FEED');
      const stub = env.POST_ROOM.get(doId);
      
      stub.fetch('http://internal/update', {
        method: 'POST',
        body: JSON.stringify({
          type: 'LIKE_UPDATE',
          postId: target_id,
          count: newCount
        })
      });
    } catch (e) {
      console.error('Failed to notify DO:', e);
    }

    return new Response(JSON.stringify({ liked, count: newCount }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Like error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
