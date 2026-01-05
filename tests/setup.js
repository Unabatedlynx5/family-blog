import { applyMigrations } from './utils/db';

// This runs before each test file
// We can't access env here easily in all environments, so we'll rely on beforeEach in tests
// or we can try to attach to globalThis if needed.
