
import type { APIRoute } from 'astro';
// @ts-ignore
import { verifyAccessToken } from '../../../../workers/utils/auth.js';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const env = locals.runtime.env as any;
  
  // Verify authentication
  let token = cookies.get('accessToken')?.value;
  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const jwtSecret = await env.JWT_SECRET;
    const decoded = verifyAccessToken(token, { JWT_SECRET: jwtSecret });
    if (!decoded) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
    }

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return new Response(JSON.stringify({ error: 'Invalid file type' }), { status: 400 });
    }

    // Upload to R2
    const r2Key = `avatars/${decoded.sub}/${crypto.randomUUID()}.png`;
    const fileBuffer = await file.arrayBuffer();
    
    await env.MEDIA.put(r2Key, fileBuffer, {
      httpMetadata: { contentType: file.type }
    });

    // Update User Profile
    // We'll use a dedicated route for serving the avatar to keep it simple: /api/media/avatar/[key]
    // Or just serve it via the existing media endpoint if we can.
    // The existing media endpoint takes an ID and looks up in `media` table.
    // We aren't inserting into `media` table here (though we could).
    // Let's just store the R2 key in avatar_url and have a way to serve it.
    // Actually, let's make a public URL if R2 is public, or a proxy endpoint.
    // Since we have `src/pages/api/media/[id].ts` which looks up DB, we can't use that easily without inserting into DB.
    // Let's create a simple proxy for avatars or just use a new endpoint `src/pages/api/avatar/[...key].ts`.
    
    // For now, let's store the path `/api/avatar/${r2Key}` in the DB.
    const avatarUrl = `/api/avatar/${r2Key}`;

    await env.DB.prepare('UPDATE users SET avatar_url = ? WHERE id = ?')
      .bind(avatarUrl, decoded.sub)
      .run();

    return new Response(JSON.stringify({ ok: true, avatar_url: avatarUrl }), { status: 200 });

  } catch (err) {
    console.error('Avatar upload error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
