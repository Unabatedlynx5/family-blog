import type { APIRoute } from 'astro';

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
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const metadataStr = formData.get('metadata') as string;
    
    let metadata: Record<string, { width: number, height: number }> = {};
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch (e) {
        console.error('Failed to parse metadata', e);
      }
    }

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ error: 'No files provided' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create event
    const eventId = crypto.randomUUID();
    const userId = locals.user.sub;
    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      'INSERT INTO upload_events (id, user_id, created_at) VALUES (?, ?, ?)'
    ).bind(eventId, userId, now).run();

    const uploadedPhotos = [];

    for (const file of files) {
      // Validate image
      if (!file.type.startsWith('image/')) continue;
      
      const photoId = crypto.randomUUID();
      const ext = file.name.split('.').pop() || 'jpg';
      const r2Key = `users/${userId}/photos/${photoId}.${ext}`; // Store as requested
      
      // Upload to R2
      await env.MEDIA.put(r2Key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type }
      });

      // Get dims
      // We rely on client sending dimensions in metadata keyed by filename
      // If duplicates exist, this might be flaky, but for MVP it's okay.
      const dims = metadata[file.name] || { width: 0, height: 0 };

      // Insert into DB
      await env.DB.prepare(
        'INSERT INTO photos (id, event_id, user_id, r2_key, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(photoId, eventId, userId, r2Key, dims.width, dims.height, now).run();

      uploadedPhotos.push({
        id: photoId,
        url: `/api/media/serve?key=${encodeURIComponent(r2Key)}` // We need a way to serve these if they aren't public
      });
    }

    return new Response(JSON.stringify({ ok: true, eventId, photos: uploadedPhotos }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Upload error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
