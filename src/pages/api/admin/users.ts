/**
 * Admin users endpoint - list and create users
 * 
 * Security Fixes Applied:
 * - HIGH Issue #3: Proper TypeScript types (removed 'any')
 * - HIGH Issue #8: Pagination limits to prevent abuse
 * - Input validation for email and password
 */

import type { APIRoute } from 'astro';
import bcrypt from 'bcryptjs';
import type { CloudflareEnv, DBUser } from '../../../types/cloudflare';
import { CONFIG, isValidEmail, isValidUUID } from '../../../types/cloudflare';
import { requireAdmin, validatePagination } from '../../../../workers/utils/validation.ts';

export const prerender = false;

/** Request body for creating a user */
interface CreateUserBody {
  email: string;
  password: string;
  name?: string;
}

/** User row for list response (without password_hash) */
interface UserListRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  is_active: number;
  created_at: number;
  created_by_admin: number;
}

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Check admin privileges
  const authError = requireAdmin(locals.user);
  if (authError) return authError;

  try {
    // Security: Validate and enforce pagination limits
    // HIGH Issue #8 Fix
    const paginationResult = validatePagination(
      url.searchParams.get('page'),
      url.searchParams.get('limit')
    );
    
    if (paginationResult instanceof Response) {
      return paginationResult;
    }
    
    const { page, limit, offset } = paginationResult;
    const search = url.searchParams.get('search') || '';
    const isActive = url.searchParams.get('is_active'); // '1', '0', or undefined

    // Validate search length to prevent abuse
    if (search.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Search query too long' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    let query = 'SELECT id, email, name, avatar_url, is_active, created_at, created_by_admin FROM users WHERE 1=1';
    const params: (string | number)[] = [];

    if (search) {
      query += ' AND (email LIKE ? OR name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (isActive !== null && isActive !== undefined && (isActive === '0' || isActive === '1')) {
      query += ' AND is_active = ?';
      params.push(parseInt(isActive, 10));
    }

    // Count total for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
    const countParams: (string | number)[] = [];
    
    if (search) {
      countQuery += ' AND (email LIKE ? OR name LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    if (isActive !== null && isActive !== undefined && (isActive === '0' || isActive === '1')) {
      countQuery += ' AND is_active = ?';
      countParams.push(parseInt(isActive, 10));
    }

    const countResult = await env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>();
    const total = countResult?.count || 0;

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const { results } = await env.DB.prepare(query).bind(...params).all<UserListRow>();

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
  const env = locals.runtime.env as CloudflareEnv;
  
  // Security: Check admin privileges
  const authError = requireAdmin(locals.user);
  if (authError) return authError;

  let body: CreateUserBody;
  try {
    body = await request.json() as CreateUserBody;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }), 
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const { email, password, name } = body;
  
  // Security: Validate required fields
  if (!email || !password) {
    return new Response(
      JSON.stringify({ error: 'Missing fields' }), 
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Security: Validate email format
  if (!isValidEmail(email)) {
    return new Response(
      JSON.stringify({ error: 'Invalid email format' }), 
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Security: Validate password strength
  if (password.length < CONFIG.auth.passwordMinLength) {
    return new Response(
      JSON.stringify({ error: `Password must be at least ${CONFIG.auth.passwordMinLength} characters` }), 
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Security: Validate name length if provided
  if (name && name.length > 100) {
    return new Response(
      JSON.stringify({ error: 'Name too long (max 100 characters)' }), 
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email.toLowerCase().trim())
      .first<{ id: string }>();
      
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
      .bind(id, email.toLowerCase().trim(), hash, (name || '').trim(), 1, now, 1)
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
