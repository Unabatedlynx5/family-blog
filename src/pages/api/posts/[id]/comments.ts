/**
 * Comments API endpoint for blog posts
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - HIGH Issue #9: Comment content validation with length limits
 * - CRITICAL Issue #1: Rate limiting for comment creation
 * - MEDIUM Issue #21: UUID validation for post ID
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../../../types/cloudflare';
import { CONFIG, isValidUUID } from '../../../../types/cloudflare';
import { verifyAccessToken } from '../../../../../workers/utils/auth.ts';
import { isRateLimited, getRateLimitInfo, createRateLimitResponse } from '../../../../../workers/utils/rate-limit.ts';
import { requireAuth, validateCommentContent, validatePostId } from '../../../../../workers/utils/validation.ts';

export const prerender = false;

/** Comment data returned by API */
interface CommentData {
  id: string;
  post_id: string;
  content: string;
  created_at: number;
  user_id: string;
  name: string;
  avatar_url: string | null;
  like_count: number;
  user_has_liked: number;
}

/** Request body for creating a comment */
interface CreateCommentBody {
  content: string;
}

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  const { id } = params;

  // Security: Validate post ID format
  const postIdError = validatePostId(id);
  if (postIdError) return postIdError;

  try {
    const currentUserId = locals.user?.sub || '';

    const comments = await env.DB.prepare(`
      SELECT 
        c.id,
        c.post_id,
        c.content,
        c.created_at,
        u.id as user_id,
        u.name,
        u.avatar_url,
        (SELECT COUNT(*) FROM likes WHERE target_id = c.id AND target_type = 'comment') as like_count,
        (SELECT COUNT(*) FROM likes WHERE target_id = c.id AND target_type = 'comment' AND user_id = ?) as user_has_liked
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `).bind(currentUserId, id).all<CommentData>();

    return new Response(JSON.stringify({ comments: comments.results }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Error fetching comments:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ params, request, locals, cookies }) => {
  const env = locals.runtime.env as CloudflareEnv;
  const { id: postId } = params;

  // Security: Validate post ID format
  const postIdError = validatePostId(postId);
  if (postIdError) return postIdError;

  // Security: Check authentication via middleware
  const authError = requireAuth(locals.user);
  if (authError) return authError;
  
  const userId = locals.user!.sub;
  
  // Security: Rate limiting - 30 comments per hour per user
  // CRITICAL Issue #1 Fix
  const rateLimitKey = `comment:${userId}`;
  if (isRateLimited(rateLimitKey, CONFIG.rateLimit.commentMaxRequests, CONFIG.rateLimit.commentWindowMs)) {
    const info = getRateLimitInfo(rateLimitKey, CONFIG.rateLimit.commentMaxRequests);
    return createRateLimitResponse(info, 'Comment limit reached. Please try again later.');
  }

  try {
    const body = await request.json() as CreateCommentBody;
    
    // Security: Validate comment content with length limits
    // HIGH Issue #9 Fix
    const contentResult = validateCommentContent(body.content);
    if (contentResult instanceof Response) return contentResult;
    const trimmedContent = contentResult;

    const commentId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      'INSERT INTO comments (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(commentId, postId, userId, trimmedContent, now)
      .run();

    // Fetch the created comment with user info to return
    const newComment = await env.DB.prepare(`
      SELECT 
        c.id,
        c.post_id,
        c.content,
        c.created_at,
        u.id as user_id,
        u.name,
        u.avatar_url
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).bind(commentId).first<Omit<CommentData, 'like_count' | 'user_has_liked'>>();

    // Notify Durable Object (fire and forget)
    try {
      const doId = env.POST_ROOM.idFromName(postId!);
      const stub = env.POST_ROOM.get(doId);
      
      stub.fetch('http://internal/update', {
        method: 'POST',
        body: JSON.stringify({
          type: 'NEW_COMMENT',
          comment: {
            ...newComment,
            like_count: 0,
            user_has_liked: 0
          }
        })
      });
    } catch (e) {
      console.error('Failed to notify DO:', e);
    }

    return new Response(JSON.stringify({ comment: newComment }), { 
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Error creating comment:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
