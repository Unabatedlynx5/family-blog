import { beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestEnv, getTestEnv } from './utils/miniflare.js';
import { resetDatabase } from './utils/db.js';

let mf: any;
let env;

beforeAll(async () => {
  // 1. Create the Miniflare environment (spins up the workers)
  mf = await createTestEnv();
  
  // 2. Get the bindings (DB, KV, R2, Service Bindings) as the 'family-blog' worker sees them
  env = await getTestEnv(mf);
  
  // MOCK EMAIL BINDING if missing (Miniflare might not expose the send_email binding directly via getBindings yet)
  if (env && !env.EMAIL) {
    env.EMAIL = {
      send: async (message: any) => {
        // console.log("Mock Email Sent:", message);
        return;
      }
    };
  }

  // Apply migrations to ensure DB structure exists
  // We need to import applyMigrations first.
  if (env && env.DB) {
    try {
      const { applyMigrations } = await import('./utils/db.js');
      await applyMigrations(env.DB);
    } catch (e) {
      console.error("Failed to apply migrations:", e);
    }
  }

  // 3. Attach to globalThis for easy access in tests
  globalThis.testEnv = env;
  globalThis.miniflare = mf;
});

beforeEach(async () => {
  // Ensure we have a clean DB for each test
  if (globalThis.testEnv) {
     await resetDatabase(globalThis.testEnv.DB);
  }
});

afterAll(async () => {
  if (mf) {
    await mf.dispose();
  }
});
