
import { describe, it, expect, beforeEach } from 'vitest';
import { GET as getMembers } from '../../src/pages/api/members/index.ts';

describe('Members API Integration', () => {
  let env;
  let mockLocals;

  beforeEach(() => {
    env = globalThis.testEnv;
    mockLocals = { runtime: { env } };
  });

  it('GET /api/members should return active members', async () => {
    const now = Math.floor(Date.now() / 1000);
    
    // Insert active user
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind('user-active', 'active@example.com', 'hash', 'Active User', 1, now, now)
      .run();
    
    // Insert inactive user (last seen > 5 mins ago)
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, name, is_active, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind('user-inactive', 'inactive@example.com', 'hash', 'Inactive User', 1, now, now - 500)
      .run();

    const res = await getMembers({ locals: mockLocals });
    expect(res.status).toBe(200);
    const data = await res.json();
    
    // Check if we get the active user
    // Note: TestEnv might persist data if not cleaned properly, relying on resetDatabase in setup.
    // Assuming resetDatabase works.
    
    expect(data.members).toBeDefined();
    
    // We might have other users from other tests if reset failed or run in parallel on same DB instance?
    // But we configured Miniflare to be non-persistent D1, effectively resetting on restart? 
    // No, we are in the same process. `resetDatabase` is key.
    
    const activeMember = data.members.find(m => m.id === 'user-active');
    expect(activeMember).toBeDefined();
    expect(activeMember.name).toBe('Active User');
    
    const inactiveMember = data.members.find(m => m.id === 'user-inactive');
    expect(inactiveMember).toBeUndefined();
  });
});
