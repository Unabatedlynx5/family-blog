
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
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ error: 'Invalid file type' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large (max 2MB)' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Use fixed key for user avatar to save space and allow easy overwrites
    const r2Key = `avatars/${locals.user.sub}`;
    const fileBuffer = await file.arrayBuffer();
    
    await env.MEDIA.put(r2Key, fileBuffer, {
      httpMetadata: { contentType: file.type }
    });

    // Update User Profile
    const avatarUrl = `/api/avatar/${r2Key}`;

    await env.DB.prepare('UPDATE users SET avatar_url = ? WHERE id = ?')
      .bind(avatarUrl, locals.user.sub)
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
