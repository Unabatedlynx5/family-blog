export async function post(context) {
  const req = context.request;
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;)\s*refresh=([^;]+)/);
  const token = match ? match[1] : null;
  if (token) {
    // revoke
    try {
      await context.env.DB.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').bind(token).run();
    } catch (e) {
      // ignore
    }
  }
  const res = new Response(JSON.stringify({ ok: true }), { status: 200 });
  res.headers.set('Set-Cookie', 'refresh=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
  return res;
}
