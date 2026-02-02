import type { APIRoute } from 'astro';
// @ts-ignore
import { verifyAccessToken } from '../../../../workers/utils/auth.js';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as any;
  
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate file type (images only for now)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ error: 'Invalid file type. Only images allowed.' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate file extension matches MIME type
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (!ext || !validExtensions.includes(ext)) {
      return new Response(JSON.stringify({ error: 'Invalid file extension' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return new Response(JSON.stringify({ error: 'File too large. Maximum size is 5MB.' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate unique ID and R2 key
    const id = crypto.randomUUID();
    const r2Key = `media/${locals.user!.sub}/${id}.${ext}`;

    // Get optional metadata
    const category = (formData.get('category') as string) || 'general';
    const contentDateStr = formData.get('content_date') as string;
    const contentDate = contentDateStr ? parseInt(contentDateStr) : null;

    // Upload to R2
    const fileBuffer = await file.arrayBuffer();
    await env.MEDIA.put(r2Key, fileBuffer, {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        category,
        contentDate: contentDate ? String(contentDate) : '',
      }
    });

    // Save metadata to DB
    const now = Math.floor(Date.now() / 1000);
    // Schema: id, uploader_id, r2_key, mime_type, size, created_at, category, content_date
    await env.DB.prepare(
      'INSERT INTO media (id, uploader_id, r2_key, mime_type, size, created_at, category, content_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(id, locals.user!.sub, r2Key, file.type, file.size, now, category, contentDate)
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
