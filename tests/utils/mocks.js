import { vi } from 'vitest';

export const mockDOBinding = {
  idFromName: () => ({ toString: () => "mock-id" }),
  get: () => ({
    fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })))
  })
};

export function createMockContext(env, user = null) {
    return {
        runtime: { env },
        user,
        cookies: {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn()
        },
        clientAddress: '127.0.0.1'
    };
}
