/**
 * User avatar upload endpoint
 * 
 * Security Fixes Applied:
 * - CRITICAL Issue #1: Rate limiting (10 uploads/hour)
 * - HIGH Issue #4: Content-Length validation before parsing
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../../types/cloudflare';
import { CONFIG } from '../../../types/cloudflare';
import { isRateLimited, getRateLimitInfo, createRateLimitResponse } from '../../../../workers/utils/rate-limit.ts';
import { requireAuth, validateFileUpload, validateContentLength } from '../../../../workers/utils/validation.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Check authentication first
  const authError = requireAuth(locals.user);
  if (authError) return authError;
  
  const userId = locals.user!.sub;
  
  // Security: Rate limiting - 10 avatar uploads per hour per user
  // CRITICAL Issue #1 Fix
  const rateLimitKey = `avatar:${userId}`;
  if (isRateLimited(rateLimitKey, CONFIG.rateLimit.uploadMaxRequests, CONFIG.rateLimit.uploadWindowMs)) {
    const info = getRateLimitInfo(rateLimitKey, CONFIG.rateLimit.uploadMaxRequests);
    return createRateLimitResponse(info, 'Avatar upload limit reached. Please try again later.');
  }
  
  // Security: Check Content-Length before parsing body
  // HIGH Issue #4 Fix - prevent memory exhaustion
  const contentLengthError = validateContentLength(request, CONFIG.upload.maxAvatarSize + 10240); // +10KB for form overhead
  if (contentLengthError) return contentLengthError;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    // Security: Validate file with avatar-specific size limit
    const fileError = validateFileUpload(file, CONFIG.upload.allowedImageTypes, CONFIG.upload.maxAvatarSize);
    if (fileError) return fileError;

    // Use fixed key for user avatar to save space and allow easy overwrites
    const r2Key = `avatars/${userId}`;
    const fileBuffer = await file.arrayBuffer();
    
    await env.MEDIA.put(r2Key, fileBuffer, {
      httpMetadata: { contentType: file.type }
    });

    // Update User Profile
    const avatarUrl = `/api/avatar/${r2Key}`;

    await env.DB.prepare('UPDATE users SET avatar_url = ? WHERE id = ?')
      .bind(avatarUrl, userId)
      .run();

    return new Response(JSON.stringify({ ok: true, avatar_url: avatarUrl }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Avatar upload error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
