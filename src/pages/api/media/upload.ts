/**
 * Media upload endpoint
 * 
 * Security Fixes Applied:
 * - CRITICAL Issue #1: Rate limiting (10 uploads/hour)
 * - HIGH Issue #4: Content-Length validation before parsing
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv, DBMedia } from '../../../types/cloudflare';
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
  
  // Security: Rate limiting - 10 uploads per hour per user
  // CRITICAL Issue #1 Fix
  const rateLimitKey = `upload:${userId}`;
  if (isRateLimited(rateLimitKey, CONFIG.rateLimit.uploadMaxRequests, CONFIG.rateLimit.uploadWindowMs)) {
    const info = getRateLimitInfo(rateLimitKey, CONFIG.rateLimit.uploadMaxRequests);
    return createRateLimitResponse(info, 'Upload limit reached. Please try again later.');
  }
  
  // Security: Check Content-Length before parsing body
  // HIGH Issue #4 Fix - prevent memory exhaustion
  const contentLengthError = validateContentLength(request, CONFIG.upload.maxFileSize + 10240); // +10KB for form overhead
  if (contentLengthError) return contentLengthError;

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    // Security: Validate file
    const fileError = validateFileUpload(file, CONFIG.upload.allowedImageTypes, CONFIG.upload.maxFileSize);
    if (fileError) return fileError;

    // Get validated extension
    const ext = file.name.split('.').pop()?.toLowerCase() as string;

    // Generate unique ID and R2 key
    const id = crypto.randomUUID();
    const r2Key = `media/${userId}/${id}.${ext}`;

    // Upload to R2
    const fileBuffer = await file.arrayBuffer();
    await env.MEDIA.put(r2Key, fileBuffer, {
      httpMetadata: {
        contentType: file.type,
      },
    });

    // Save metadata to DB
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'INSERT INTO media (id, uploader_id, r2_key, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(id, userId, r2Key, file.type, file.size, now)
      .run();

    return new Response(
      JSON.stringify({ 
        ok: true,
        media: {
          id,
          filename: file.name,
          content_type: file.type,
          size: file.size,
          url: `/api/media/${id}`
        }
      }), 
      { 
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Upload error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
