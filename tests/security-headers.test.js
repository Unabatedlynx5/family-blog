import { describe, it, expect } from 'vitest';
import { 
  SECURITY_HEADERS, 
  PAGE_SECURITY_HEADERS,
  addSecurityHeaders, 
  addPageSecurityHeaders,
  secureJsonResponse,
  errorResponse,
  generateRequestId,
  API_CSP,
  PAGE_CSP
} from '../workers/utils/security-headers';

describe('Security Headers', () => {
  describe('Constants', () => {
    it('should have required security headers', () => {
      expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
      expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
      expect(SECURITY_HEADERS['X-XSS-Protection']).toBe('1; mode=block');
      expect(SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(SECURITY_HEADERS['Permissions-Policy']).toContain('geolocation=()');
      expect(SECURITY_HEADERS['Content-Security-Policy']).toBe(API_CSP);
    });

    it('should have API CSP that prevents framing', () => {
      expect(API_CSP).toContain("frame-ancestors 'none'");
      expect(API_CSP).toContain("default-src 'none'");
    });

    it('should have PAGE CSP that allows self-hosted resources', () => {
      expect(PAGE_CSP).toContain("default-src 'self'");
      expect(PAGE_CSP).toContain("script-src 'self'");
      expect(PAGE_CSP).toContain("frame-ancestors 'none'");
    });

    it('should have different CSP for pages vs APIs', () => {
      expect(SECURITY_HEADERS['Content-Security-Policy']).toBe(API_CSP);
      expect(PAGE_SECURITY_HEADERS['Content-Security-Policy']).toBe(PAGE_CSP);
    });
  });

  describe('addSecurityHeaders', () => {
    it('should add all security headers to a response', () => {
      const originalResponse = new Response('test', { status: 200 });
      const secured = addSecurityHeaders(originalResponse);

      expect(secured.headers.get('X-Frame-Options')).toBe('DENY');
      expect(secured.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(secured.headers.get('Content-Security-Policy')).toBe(API_CSP);
    });

    it('should preserve original response status', () => {
      const originalResponse = new Response('test', { status: 201 });
      const secured = addSecurityHeaders(originalResponse);

      expect(secured.status).toBe(201);
    });
  });

  describe('addPageSecurityHeaders', () => {
    it('should add page-appropriate CSP', () => {
      const originalResponse = new Response('<html></html>', { 
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
      const secured = addPageSecurityHeaders(originalResponse);

      expect(secured.headers.get('Content-Security-Policy')).toBe(PAGE_CSP);
      expect(secured.headers.get('X-Frame-Options')).toBe('DENY');
    });
  });

  describe('secureJsonResponse', () => {
    it('should create JSON response with security headers', async () => {
      const response = secureJsonResponse({ ok: true }, 200);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      
      const body = await response.json();
      expect(body.ok).toBe(true);
    });

    it('should default to 200 status', () => {
      const response = secureJsonResponse({ data: 'test' });
      expect(response.status).toBe(200);
    });
  });

  describe('errorResponse', () => {
    it('should create error response with message and status', async () => {
      const response = errorResponse('Not found', 404);

      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      const body = await response.json();
      expect(body.error).toBe('Not found');
    });

    it('should include security headers', () => {
      const response = errorResponse('Server error', 500);
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });
  });

  describe('generateRequestId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).not.toBe(id2);
    });

    it('should have timestamp-random format', () => {
      const id = generateRequestId();
      const parts = id.split('-');
      
      // Should have at least 2 parts (timestamp-random)
      expect(parts.length).toBeGreaterThanOrEqual(2);
      
      // First part should be a timestamp (numeric)
      const timestamp = parseInt(parts[0], 10);
      expect(timestamp).toBeGreaterThan(0);
      expect(timestamp).toBeLessThanOrEqual(Date.now());
    });
  });
});
