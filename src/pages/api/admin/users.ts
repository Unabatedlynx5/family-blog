import type { APIRoute } from 'astro';
// @ts-ignore
import bcrypt from 'bcryptjs';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as any;
  const adminKey = request.headers.get('x-admin-key') || '';
  
  // Secrets are promises in Cloudflare runtime - await them
  const expectedAdminKey = await env.ADMIN_API_KEY;
  
  if (!adminKey || adminKey !== expectedAdminKey) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }), 
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }), 
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const { email, password, name } = body as { email: string; password: string; name?: string };
  if (!email || !password) {
    return new Response(
      JSON.stringify({ error: 'Missing fields' }), 
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();
      
    if (existing) {
      return new Response(
        JSON.stringify({ error: 'User exists' }), 
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const hash = bcrypt.hashSync(password, 10);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    
    await env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, name, is_active, created_at, created_by_admin) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(id, email, hash, name || '', 1, now, 1)
      .run();

    return new Response(
      JSON.stringify({ ok: true, id }), 
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error creating user:', err);
    return new Response(
      JSON.stringify({ error: 'Server error', details: err instanceof Error ? err.message : String(err) }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
