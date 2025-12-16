import { verifyAccessToken } from '../../../workers/utils/auth.js';

export async function post(context) {
  const req = context.request;
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/Bearer\s+(.+)/);
  if (!match) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const token = match[1];
  const payload = verifyAccessToken(token);
  if (!payload) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const contentType = req.headers.get('Content-Type') || '';
  if (!contentType.startsWith('multipart/form-data') && !contentType.startsWith('application/octet-stream')) {
    return new Response(JSON.stringify({ error: 'Invalid content type' }), { status: 400 });
  }
  // For MVP: accept raw body and write to R2 with a random key
  const buf = await req.arrayBuffer();
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await context.env.MEDIA.put(key, buf);
    const now = Math.floor(Date.now() / 1000);
    // store metadata in DB if auth provided via X-User-Id
    const userId = payload.sub || payload.id;
    if (userId) {
      await context.env.DB.prepare('INSERT INTO media (id, uploader_id, r2_key, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), userId, key, req.headers.get('Content-Type') || 'application/octet-stream', buf.byteLength, now)
        .run();
    }
    return new Response(JSON.stringify({ key }), { status: 201 });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500 });
  }
}
