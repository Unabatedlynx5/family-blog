/**
 * Posts API endpoint
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - HIGH Issue #8: Pagination limits to prevent abuse
 * - CRITICAL Issue #1: Rate limiting for post creation
 * - LOW Issue #33: Database query batching for better performance
 */

import type { APIRoute } from 'astro';
import type { D1Result } from '@cloudflare/workers-types';
import type { CloudflareEnv, DBPost } from '../../../types/cloudflare';
import { CONFIG, isValidUUID } from '../../../types/cloudflare';
import { isRateLimited, getRateLimitInfo, createRateLimitResponse } from '../../../../workers/utils/rate-limit.ts';
import { requireAuth, validatePagination, validatePostContent } from '../../../../workers/utils/validation.ts';

export const prerender = false;

/** Request body for creating a post */
interface CreatePostBody {
  content: string;
  media_id?: string;
}

// List posts
export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Validate and enforce pagination limits
  // HIGH Issue #8 Fix
  const paginationResult = validatePagination(
    url.searchParams.get('page'),
    url.searchParams.get('limit')
  );
  
  if (paginationResult instanceof Response) {
    return paginationResult;
  }
  
  const { page, limit, offset } = paginationResult;

  try {
    // LOW Issue #33 Fix: Batch queries for better performance
    const [postsResult, countResult] = await env.DB.batch([
      env.DB.prepare(`
        SELECT * FROM posts 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `).bind(limit, offset),
      env.DB.prepare('SELECT COUNT(*) as count FROM posts')
    ]) as [D1Result<DBPost>, D1Result<{ count: number }>];
    
    const posts = postsResult.results || [];
    const total = countResult.results?.[0]?.count || 0;
    
    return new Response(JSON.stringify({
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('Get posts error:', e);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Create a new post
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Check authentication via middleware
  const authError = requireAuth(locals.user);
  if (authError) return authError;
  
  const userId = locals.user!.sub;
  
  // Security: Rate limiting - 20 posts per hour per user
  // CRITICAL Issue #1 Fix
  const rateLimitKey = `post:${userId}`;
  if (isRateLimited(rateLimitKey, CONFIG.rateLimit.postMaxRequests, CONFIG.rateLimit.postWindowMs)) {
    const info = getRateLimitInfo(rateLimitKey, CONFIG.rateLimit.postMaxRequests);
    return createRateLimitResponse(info, 'Post limit reached. Please try again later.');
  }

  try {
    let body: CreatePostBody;
    try {
      body = await request.json() as CreatePostBody;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { content, media_id } = body;
    
    // Validate content
    const contentResult = validatePostContent(content);
    if (contentResult instanceof Response) return contentResult;
    const validatedContent = contentResult;

    // If media_id provided, verify it exists and belongs to user
    if (media_id) {
      // Validate UUID format
      if (!isValidUUID(media_id)) {
        return new Response(JSON.stringify({ error: 'Invalid media ID format' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const media = await env.DB.prepare(
        'SELECT id FROM media WHERE id = ? AND uploader_id = ?'
      ).bind(media_id, userId).first<{ id: string }>();
      
      if (!media) {
        return new Response(JSON.stringify({ error: 'Invalid media ID' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Create post
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const mediaRefs = media_id ? JSON.stringify([media_id]) : null;
    
    await env.DB.prepare(
      'INSERT INTO posts (id, user_id, content, media_refs, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(id, userId, validatedContent, mediaRefs, now)
      .run();

    return new Response(
      JSON.stringify({ 
        ok: true,
        post: {
          id,
          user_id: userId,
          content: validatedContent,
          media_refs: mediaRefs,
          created_at: now
        }
      }), 
      { 
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Post creation error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
