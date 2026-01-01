/**
 * Health Check API Tests
 * 
 * LOW Issue #29 Fix: Tests for health check endpoint
 */

import { describe, it, expect, vi } from 'vitest';

// Mock D1 database
function createMockDB(shouldFail = false) {
  return {
    prepare: () => ({
      first: async () => {
        if (shouldFail) throw new Error('Database error');
        return { health_check: 1 };
      },
      bind: () => ({
        first: async () => {
          if (shouldFail) throw new Error('Database error');
          return { health_check: 1 };
        }
      })
    })
  };
}

// Mock R2 bucket
function createMockBucket(shouldFail = false) {
  return {
    list: async () => {
      if (shouldFail) throw new Error('Storage error');
      return { objects: [] };
    }
  };
}

describe('Health Check Endpoint', () => {
  it('should return healthy status when all services are up', async () => {
    // Dynamically import to avoid module resolution issues
    const { GET } = await import('../src/pages/api/health.ts');
    
    const mockLocals = {
      runtime: {
        env: {
          DB: createMockDB(false),
          MEDIA: createMockBucket(false)
        }
      }
    };
    
    const response = await GET(/** @type {any} */ ({
      locals: mockLocals,
      request: new Request('http://localhost/api/health'),
      cookies: {},
      params: {},
      url: new URL('http://localhost/api/health')
    }));
    
    expect(response.status).toBe(200);
    
    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.checks.database.status).toBe('pass');
    expect(body.checks.storage.status).toBe('pass');
    expect(body.timestamp).toBeDefined();
  });
  
  it('should return unhealthy status when database is down', async () => {
    const { GET } = await import('../src/pages/api/health.ts');
    
    const mockLocals = {
      runtime: {
        env: {
          DB: createMockDB(true), // DB fails
          MEDIA: createMockBucket(false)
        }
      }
    };
    
    const response = await GET(/** @type {any} */ ({
      locals: mockLocals,
      request: new Request('http://localhost/api/health'),
      cookies: {},
      params: {},
      url: new URL('http://localhost/api/health')
    }));
    
    expect(response.status).toBe(503);
    
    const body = await response.json();
    expect(body.status).toBe('unhealthy');
    expect(body.checks.database.status).toBe('fail');
  });
  
  it('should return degraded status when only storage is down', async () => {
    const { GET } = await import('../src/pages/api/health.ts');
    
    const mockLocals = {
      runtime: {
        env: {
          DB: createMockDB(false),
          MEDIA: createMockBucket(true) // Storage fails
        }
      }
    };
    
    const response = await GET(/** @type {any} */ ({
      locals: mockLocals,
      request: new Request('http://localhost/api/health'),
      cookies: {},
      params: {},
      url: new URL('http://localhost/api/health')
    }));
    
    expect(response.status).toBe(200);
    
    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.database.status).toBe('pass');
    expect(body.checks.storage.status).toBe('fail');
  });
  
  it('should return healthy status without runtime env (static context)', async () => {
    const { GET } = await import('../src/pages/api/health.ts');
    
    const mockLocals = {
      // No runtime env - simulating static build
    };
    
    const response = await GET(/** @type {any} */ ({
      locals: mockLocals,
      request: new Request('http://localhost/api/health'),
      cookies: {},
      params: {},
      url: new URL('http://localhost/api/health')
    }));
    
    expect(response.status).toBe(200);
    
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });
  
  it('should include response time in health status', async () => {
    const { GET } = await import('../src/pages/api/health.ts');
    
    const mockLocals = {
      runtime: {
        env: {
          DB: createMockDB(false),
          MEDIA: createMockBucket(false)
        }
      }
    };
    
    const response = await GET(/** @type {any} */ ({
      locals: mockLocals,
      request: new Request('http://localhost/api/health'),
      cookies: {},
      params: {},
      url: new URL('http://localhost/api/health')
    }));
    
    const body = await response.json();
    expect(typeof body.responseTimeMs).toBe('number');
    expect(body.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(typeof body.checks.database.responseTimeMs).toBe('number');
    expect(typeof body.checks.storage.responseTimeMs).toBe('number');
  });
});

describe('Logger Utility', () => {
  it('should have all log methods available', async () => {
    const { logger } = await import('../workers/utils/logger.ts');
    
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.json).toBe('function');
    expect(typeof logger.security).toBe('function');
    expect(typeof logger.perf).toBe('function');
  });
  
  it('should have startTimer function', async () => {
    const { startTimer } = await import('../workers/utils/logger.ts');
    
    expect(typeof startTimer).toBe('function');
    
    const timer = startTimer('test-operation');
    expect(typeof timer.stop).toBe('function');
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const duration = timer.stop();
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });
  
  it('should format log entries correctly', async () => {
    const { logger } = await import('../workers/utils/logger.ts');
    
    // Spy on console methods
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    logger.info('Test info message');
    logger.warn('Test warning message');
    logger.error('Test error message');
    
    expect(infoSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    
    // Check that logs include level prefix
    const infoCall = infoSpy.mock.calls[0][0];
    expect(infoCall).toContain('[INFO]');
    expect(infoCall).toContain('Test info message');
    
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
  
  it('should handle security logging as JSON', async () => {
    const { logger } = await import('../workers/utils/logger.ts');
    
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    logger.security('LOGIN_ATTEMPT', {
      userId: 'user-123',
      ip: '192.168.1.1',
      success: true
    });
    
    expect(logSpy).toHaveBeenCalled();
    
    // Security logs should be JSON
    const logCall = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(logCall);
    expect(parsed.type).toBe('security');
    expect(parsed.event).toBe('LOGIN_ATTEMPT');
    expect(parsed.userId).toBe('user-123');
    expect(parsed.ip).toBe('192.168.1.1');
    expect(parsed.success).toBe(true);
    
    logSpy.mockRestore();
  });
});

describe('API Versioning', () => {
  it('should export API_VERSION constant', async () => {
    const { API_VERSION } = await import('../workers/utils/validation.ts');
    
    expect(API_VERSION).toBeDefined();
    expect(typeof API_VERSION).toBe('string');
    expect(API_VERSION).toBe('1');
  });
  
  it('should have getApiVersion function', async () => {
    const { getApiVersion } = await import('../workers/utils/validation.ts');
    
    expect(typeof getApiVersion).toBe('function');
    
    // Test with header
    const request1 = new Request('http://localhost/api/test', {
      headers: { 'X-API-Version': '2' }
    });
    expect(getApiVersion(request1)).toBe('2');
    
    // Test without header (defaults to current version)
    const request2 = new Request('http://localhost/api/test');
    expect(getApiVersion(request2)).toBe('1');
  });
  
  it('should have addApiVersionHeader function', async () => {
    const { addApiVersionHeader, API_VERSION } = await import('../workers/utils/validation.ts');
    
    expect(typeof addApiVersionHeader).toBe('function');
    
    const response = new Response('test', { status: 200 });
    const enhanced = addApiVersionHeader(response);
    
    expect(enhanced.headers.get('X-API-Version')).toBe(API_VERSION);
  });
  
  it('should have parseJsonBody function', async () => {
    const { parseJsonBody } = await import('../workers/utils/validation.ts');
    
    expect(typeof parseJsonBody).toBe('function');
    
    // Test valid JSON
    const validRequest = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'value' })
    });
    
    const result = await parseJsonBody(validRequest);
    expect(result).toEqual({ test: 'value' });
    
    // Test invalid JSON
    const invalidRequest = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json'
    });
    
    const errorResult = await parseJsonBody(invalidRequest);
    expect(errorResult instanceof Response).toBe(true);
    expect(/** @type {Response} */ (errorResult).status).toBe(400);
    
    // Test wrong content-type
    const wrongTypeRequest = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ test: 'value' })
    });
    
    const typeError = await parseJsonBody(wrongTypeRequest);
    expect(typeError instanceof Response).toBe(true);
    expect(/** @type {Response} */ (typeError).status).toBe(415);
  });
});
