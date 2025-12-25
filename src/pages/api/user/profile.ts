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

  const userId = locals.user.sub;

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
