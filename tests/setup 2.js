import { beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';

let dispose;

beforeAll(async () => {
  const proxy = await getPlatformProxy({
    persist: {
      // Use in-memory storage for tests to ensure isolation and speed
      // Note: getPlatformProxy persistence options might differ from Miniflare's
      // For now, let's try default persistence or check if we can disable it.
      // Actually, getPlatformProxy defaults to persisting to .wrangler/state/v3
      // To make it ephemeral, we might need to clean up or use a specific option if available.
      // But for now, let's just get it running.
    }
  });
  
  globalThis.env = proxy.env;
  
  // Inject test secrets that might be missing from wrangler.json
  globalThis.env.JWT_SECRET = 'test-secret';
  globalThis.env.ADMIN_API_KEY = 'test-admin-key';
  
  // Polyfill getMiniflareBindings for compatibility with existing tests
  globalThis.getMiniflareBindings = () => proxy.env;
  
  dispose = proxy.dispose;
});

afterAll(async () => {
  if (dispose) await dispose();
});
