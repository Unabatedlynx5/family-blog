import { rotateRefreshToken, createAccessToken } from '../../../workers/utils/auth.js';

export async function post(context) {
  const req = context.request;
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;)\s*refresh=([^;]+)/);
  const token = match ? match[1] : null;
  if (!token) return new Response(JSON.stringify({ error: 'No refresh token' }), { status: 401 });

  try {
    const data = await rotateRefreshToken(context.env.DB, token);
    if (!data) return new Response(JSON.stringify({ error: 'Invalid refresh token' }), { status: 401 });

    const accessToken = createAccessToken({ sub: data.user_id });
    const res = new Response(JSON.stringify({ accessToken }), { status: 200 });
    res.headers.set('Set-Cookie', `refresh=${data.newToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 60 * 60}`);
    return res;
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
