import bcrypt from 'bcryptjs';

export async function post(context) {
  const req = context.request;
  const adminKey = req.headers.get('x-admin-key') || '';
  if (!adminKey || adminKey !== context.env.ADMIN_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  const { email, password, name } = body;
  if (!email || !password) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });

  try {
    const existing = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return new Response(JSON.stringify({ error: 'User exists' }), { status: 409 });

    const hash = bcrypt.hashSync(password, 10);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await context.env.DB.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at, created_by_admin) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, email, hash, name || '', 1, now, 1)
      .run();

    return new Response(JSON.stringify({ ok: true, id }), { status: 201 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
