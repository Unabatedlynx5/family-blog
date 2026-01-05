import { Miniflare } from 'miniflare';

export async function setupMiniflare() {
  const mf = new Miniflare({
    modules: true,
    script: `export default { fetch: () => new Response(null, { status: 404 }) }`,
    d1Databases: ['DB'],
    r2Buckets: ['MEDIA'],
    bindings: {
      JWT_SECRET: 'test-secret',
      ADMIN_API_KEY: 'test-admin-key'
    }
  });

  const env = await mf.getBindings();
  return { mf, env };
}
