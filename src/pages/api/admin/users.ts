import type { APIRoute } from 'astro';
// @ts-ignore
import bcrypt from 'bcryptjs';
import { ADMIN_EMAIL } from '../../../consts';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, url }) => {
  const env = locals.runtime.env as any;
  
  // Check authentication
  if (!locals.user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }), 
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check admin privileges
  if (locals.user.email !== ADMIN_EMAIL) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }), 
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    const isActive = url.searchParams.get('is_active'); // '1', '0', or undefined

    const offset = (page - 1) * limit;
    
    let query = 'SELECT id, email, name, avatar_url, is_active, created_at, created_by_admin FROM users WHERE 1=1';
    const params: any[] = [];

    if (search) {
      query += ' AND (email LIKE ? OR name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (isActive !== null && isActive !== undefined) {
      query += ' AND is_active = ?';
      params.push(parseInt(isActive));
    }

    // Count total for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
    const countParams: any[] = [];
    
    if (search) {
      countQuery += ' AND (email LIKE ? OR name LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    if (isActive !== null && isActive !== undefined) {
      countQuery += ' AND is_active = ?';
      countParams.push(parseInt(isActive));
    }

    const countResult = await env.DB.prepare(countQuery).bind(...countParams).first();
    const total = countResult?.count || 0;

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const { results } = await env.DB.prepare(query).bind(...params).all();

    return new Response(
      JSON.stringify({
        users: results,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Error listing users:', err);
    return new Response(
      JSON.stringify({ error: 'Server error' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as any;
  
  // Check authentication
  if (!locals.user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }), 
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check admin privileges
  if (locals.user.email !== ADMIN_EMAIL) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }), 
      { status: 403, headers: { 'Content-Type': 'application/json' } }
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
      JSON.stringify({ error: 'Server error' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
