# Testing Structure

This project uses **Vitest** + **Miniflare 3** for integration testing.

## Directory Structure
- `tests/integration/`: API tests running against a full Miniflare environment (Mock Workers, D1, DO).
- `tests/unit/`: Pure logic unit tests.
- `tests/fixtures/`: SQL seeds and test data.
- `tests/utils/`: Helper utilities (miniflare setup, db reset).

## Running Tests
```bash
npm test
```

## Environment
The `vitest.setup.ts` initializes a global Miniflare instance.
- `d1Persist` is FALSE (In-Memory DB) to avoid concurrency locks.
- `GlobalChat` and `PostRoom` Durable Objects are mocked within the `family-blog` worker in Miniflare.

## Global Helpers
- `globalThis.testEnv`: Access to bindings (DB, KV, etc).
- `globalThis.miniflare`: The Miniflare instance.
