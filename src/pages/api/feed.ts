/**
 * Feed API endpoint - returns combined blog posts and user posts
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - HIGH Issue #8: Pagination limits to prevent abuse
 * - CRITICAL Issue #1: Rate limiting for post creation
 * - LOW Issue #33: Database query batching for better performance
 */

import type { APIRoute } from 'astro';
import type { D1Result } from '@cloudflare/workers-types';
import { getCollection } from 'astro:content';
import type { CloudflareEnv } from '../../types/cloudflare.ts';
import { CONFIG } from '../../types/cloudflare.ts';
import { isRateLimited, getRateLimitInfo, createRateLimitResponse } from '../../../workers/utils/rate-limit.ts';
import { requireAuth, validatePagination, validatePostContent } from '../../../workers/utils/validation.ts';
import { verifyAccessToken } from '../../../workers/utils/auth.ts';

export const prerender = false;

/** Database post row */
interface DBPostRow {
  id: string;
  user_id: string;
  content: string;
  created_at: number;
  media_refs: string | null;
  likes: string | null;
  name: string;
  email: string;
  avatar_url: string | null;
}

/** Formatted post for API response */
interface FormattedPost {
  id: string;
  user_id: string;
  content: string;
  created_at: number;
  name: string;
  email: string;
  source: 'markdown' | 'ui';
  title?: string;
  slug?: string;
  media_url: string | null;
  like_count: number;
  user_has_liked: number;
  avatar_url?: string | null;
}

/** Request body for creating a post */
interface CreatePostBody {
  content?: string;
  media_id?: string;
}

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  try {
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

    // 1. Fetch Markdown posts
    const markdownPosts = await getCollection('blog');

    const formattedMarkdownPosts: FormattedPost[] = markdownPosts.map(post => {
      const id = `md-${post.id}`;
      
      return {
        id,
        user_id: 'admin',
        content: post.body,
        created_at: Math.floor(post.data.pubDate.getTime() / 1000),
        name: 'Family Blog',
        email: '',
        source: 'markdown' as const,
        title: post.data.title,
        slug: post.id,
        media_url: post.data.heroImage || null,
        like_count: 0,
        user_has_liked: 0
      };
    });

    // 2. Fetch DB posts with pagination-aware limit
    // LOW Issue #33 Fix: Batch queries for better performance
    const dbFetchLimit = offset + limit;
    const currentUserId = locals.user?.sub || '';

    // Batch both queries together for efficiency
    const [dbResult, dbCountRow] = await env.DB.batch([
      env.DB.prepare(`
        SELECT 
          p.id,
          p.user_id,
          p.content,
          p.created_at,
          p.media_refs,
          p.likes,
          u.name,
          u.email,
          u.avatar_url
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at DESC
        LIMIT ?
      `).bind(dbFetchLimit),
      env.DB.prepare('SELECT COUNT(*) as count FROM posts')
    ]) as [D1Result<DBPostRow>, D1Result<{ count: number }>];

    const dbTotal = dbCountRow.results?.[0]?.count || 0;

    const dbPosts: FormattedPost[] = (dbResult.results || []).map((post) => {
      // Parse likes
      let like_count = 0;
      let user_has_liked = 0;
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

      // Parse media refs
      let media_url: string | null = null;
      if (post.media_refs) {
        try {
          const refs = JSON.parse(post.media_refs);
          if (Array.isArray(refs) && refs.length > 0) {
            media_url = `/api/media/${refs[0]}`;
          }
        } catch {
          // ignore parse error
        }
      }
      
      return {
        id: post.id,
        user_id: post.user_id,
        content: post.content,
        created_at: post.created_at,
        name: post.name,
        email: post.email,
        avatar_url: post.avatar_url,
        like_count,
        user_has_liked,
        media_url,
        source: 'ui' as const
      };
    });

    // Merge and Sort
    const allPosts = [...formattedMarkdownPosts, ...dbPosts].sort((a, b) => b.created_at - a.created_at);

    // Paginate in memory
    const total = formattedMarkdownPosts.length + dbTotal;
    const paginatedPosts = allPosts.slice(offset, offset + limit);

    return new Response(
      JSON.stringify({
        posts: paginatedPosts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: offset + limit < total
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Feed error:', err);
    return new Response(
      JSON.stringify({ error: 'Server error', posts: [] }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

export const POST: APIRoute = async ({ request, locals, cookies }) => {
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
    const body = await request.json() as CreatePostBody;
    const { content, media_id } = body;

    if (!content && !media_id) {
      return new Response(JSON.stringify({ error: 'Content or media required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate content if provided
    let validatedContent = '';
    if (content) {
      const contentResult = validatePostContent(content);
      if (contentResult instanceof Response) return contentResult;
      validatedContent = contentResult;
    }

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
    console.error('Post error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
