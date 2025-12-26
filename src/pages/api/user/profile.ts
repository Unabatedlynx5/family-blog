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

    // Validate name
    if (!name || typeof name !== 'string') {
        return new Response(JSON.stringify({ error: 'Name is required' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
        return new Response(JSON.stringify({ error: 'Name cannot be empty' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    if (trimmedName.length > 100) {
        return new Response(JSON.stringify({ error: 'Name must be 100 characters or less' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    // Validate birthday format if provided (YYYY-MM-DD)
    let validatedBirthday = null;
    if (birthday) {
      if (typeof birthday !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid birthday format' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // Validate YYYY-MM-DD format
      const birthdayRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!birthdayRegex.test(birthday)) {
        return new Response(JSON.stringify({ error: 'Birthday must be in YYYY-MM-DD format' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      validatedBirthday = birthday;
    }

    // Update user profile
    await env.DB.prepare(`
      UPDATE users 
      SET name = ?, birthday = ?
      WHERE id = ?
    `)
    .bind(trimmedName, validatedBirthday, userId)
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
