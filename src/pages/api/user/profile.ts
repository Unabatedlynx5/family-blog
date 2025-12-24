import type { APIRoute } from 'astro';

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

  // Decode token to get user ID
  let userId;
  try {
    const parts = token.split('.');
    const payload = JSON.parse(atob(parts[1]));
    userId = payload.sub;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
  }

  try {
    const body = await request.json() as any;
    const { name, birthday } = body;

    if (!name) {
        return new Response(JSON.stringify({ error: 'Name is required' }), { status: 400 });
    }

    // Update user profile
    await env.DB.prepare(`
      UPDATE users 
      SET name = ?, birthday = ?
      WHERE id = ?
    `)
    .bind(name, birthday || null, userId)
    .run();

    return new Response(JSON.stringify({ ok: true }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Profile update error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
