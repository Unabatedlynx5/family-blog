import { rotateRefreshToken, createAccessToken } from '../../../workers/utils/auth.js';

export async function post(context) {
  const req = context.request;
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;)\s*refresh=([^;]+)/);
  const token = match ? match[1] : null;
  if (!token) return new Response(JSON.stringify({ error: 'No refresh token' }), { 
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });

  try {
    const data = await rotateRefreshToken(context.env.DB, token);
    if (!data) return new Response(JSON.stringify({ error: 'Invalid refresh token' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });

    const accessToken = createAccessToken({ sub: data.user_id }, context.env);
    const res = new Response(JSON.stringify({ accessToken }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    res.headers.set('Set-Cookie', `refresh=${data.newToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 60 * 60}`);
    return res;
  } catch (err) {
    console.error('Refresh error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
