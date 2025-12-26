import type { APIRoute } from 'astro';
// @ts-ignore
import { verifyPassword, createAccessToken, createAndStoreRefreshToken } from '../../../../workers/utils/auth.js';
// @ts-ignore
import { isRateLimited, getRateLimitInfo } from '../../../../workers/utils/rate-limit.js';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies, clientAddress }) => {
  const env = locals.runtime.env as any;
  
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { email, password } = body as { email: string; password: string };

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Missing credentials' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Rate limiting: 5 attempts per 15 minutes per IP or email
  const rateLimitKey = `login:${clientAddress || 'unknown'}:${email}`;
  if (isRateLimited(rateLimitKey, 5, 15 * 60 * 1000)) {
    const info = getRateLimitInfo(rateLimitKey) as { remaining: number; reset: number };
    return new Response(JSON.stringify({ 
      error: 'Too many login attempts. Please try again later.',
      retryAfter: Math.ceil((info.reset - Date.now()) / 1000)
    }), { 
      status: 429,
      headers: { 
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((info.reset - Date.now()) / 1000))
      }
    });
  }

  try {
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1')
      .bind(email)
      .first();
      
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const jwtSecret = await env.JWT_SECRET;
    const accessToken = createAccessToken({ sub: user.id, email: user.email, name: user.name }, { JWT_SECRET: jwtSecret });
    const refreshToken = await createAndStoreRefreshToken(env.DB, user.id);

    // Set access token cookie
    cookies.set('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 15 // 15 minutes
    });

    // Set refresh token cookie
    cookies.set('refresh', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    return new Response(
      JSON.stringify({ 
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err) {
    console.error('Login error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
