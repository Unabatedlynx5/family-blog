import { createHash } from 'crypto';

export async function post(context) {
  const req = context.request;
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;)\s*refresh=([^;]+)/);
  const token = match ? match[1] : null;
  if (token) {
    // revoke - hash the token before looking it up
    try {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await context.env.DB.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').bind(tokenHash).run();
    } catch (e) {
      // ignore
    }
  }
  const res = new Response(JSON.stringify({ ok: true }), { 
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
  res.headers.set('Set-Cookie', 'refresh=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
  return res;
}
