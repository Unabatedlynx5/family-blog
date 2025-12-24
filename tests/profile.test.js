import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock environment
const mockEnv = {
  DB: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn(),
        run: vi.fn(),
        all: vi.fn()
      })
    })
  },
  JWT_SECRET: 'test-secret'
};

// Mock locals
const mockLocals = {
  runtime: { env: mockEnv }
};

describe('Profile API Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update profile with valid data', async () => {
    const { POST } = await import('../src/pages/api/user/profile.ts');
    
    // Mock auth token
    const token = 'header.eyJzdWIiOiJ1c2VyMTIzIn0.signature';
    const request = new Request('http://localhost/api/user/profile', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'New Name',
        birthday: '1990-01-01'
      })
    });

    const response = await POST({ request, locals: mockLocals, cookies: { get: () => ({ value: token }) } });
    expect(response.status).toBe(200);
    
    expect(mockEnv.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'));
    // Verify bind arguments: name, birthday, userId
    // Note: The exact order depends on the SQL query structure in the implementation
  });

  it('should require authentication', async () => {
    const { POST } = await import('../src/pages/api/user/profile.ts');
    
    const request = new Request('http://localhost/api/user/profile', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' })
    });

    const response = await POST({ request, locals: mockLocals, cookies: { get: () => null } });
    expect(response.status).toBe(401);
  });

  it('should require name', async () => {
    const { POST } = await import('../src/pages/api/user/profile.ts');
    
    const token = 'header.eyJzdWIiOiJ1c2VyMTIzIn0.signature';
    const request = new Request('http://localhost/api/user/profile', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ birthday: '1990-01-01' })
    });

    const response = await POST({ request, locals: mockLocals, cookies: { get: () => ({ value: token }) } });
    expect(response.status).toBe(400);
  });
});
