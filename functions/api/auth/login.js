import { verifyPassword, createAccessToken, createAndStoreRefreshToken } from '../../../workers/utils/auth.js';

export async function post(context) {
  const req = context.request;
  const body = await req.json();
  const { email, password } = body;

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Missing credentials' }), { status: 400 });
  }

  try {
    const user = await context.env.DB.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').bind(email).first();
    if (!user) return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });

    const accessToken = createAccessToken({ sub: user.id, email: user.email });
    const refreshToken = await createAndStoreRefreshToken(context.env.DB, user.id);

    const res = new Response(JSON.stringify({ accessToken }), { status: 200 });
    // Set HttpOnly secure cookie for refresh token
    res.headers.set('Set-Cookie', `refresh=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 60 * 60}`);
    return res;
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
