import type { APIRoute } from 'astro';
// @ts-ignore
import { verifyPassword, createAccessToken, createAndStoreRefreshToken } from '../../../../workers/utils/auth.js';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies }) => {
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
