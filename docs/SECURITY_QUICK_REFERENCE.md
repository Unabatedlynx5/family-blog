# Security Quick Reference

Quick checklist for developers working on the Family Blog project.

## ✅ DO's

### Authentication & Authorization
- ✅ Always check `locals.user` for authentication
- ✅ Check `locals.user.email !== ADMIN_EMAIL` for admin actions
- ✅ Use rate limiting for sensitive endpoints
- ✅ Return generic error messages to clients

### Database Operations
- ✅ Always use parameterized queries with `.bind()`
- ✅ Never concatenate user input into SQL strings
- ✅ Validate and sanitize all user input before DB operations

### Input Validation
- ✅ Check data types (`typeof value === 'string'`)
- ✅ Validate string lengths (min/max)
- ✅ Whitelist allowed values where possible
- ✅ Trim whitespace before processing
- ✅ Validate formats (email, date, etc.)

### Error Handling
- ✅ Log full errors server-side with `console.error()`
- ✅ Return generic messages to clients
- ✅ Never expose stack traces, file paths, or DB details

### File Uploads
- ✅ Validate both MIME type AND file extension
- ✅ Enforce file size limits
- ✅ Use UUIDs for filenames
- ✅ Store in user-scoped directories

## ❌ DON'Ts

### Never Expose
- ❌ Environment variables or secrets (even partial)
- ❌ Database error messages in API responses
- ❌ Stack traces to clients
- ❌ User passwords or tokens in logs
- ❌ Internal file paths or system info

### Never Trust
- ❌ Client-provided data without validation
- ❌ File extensions without checking MIME type
- ❌ Content-Length headers without verification

### Never Store
- ❌ Plaintext passwords
- ❌ Unhashed tokens
- ❌ Credit card numbers (use payment processor)

## Code Templates

### Rate Limited Endpoint
```typescript
import { isRateLimited, getRateLimitInfo } from '../../../../workers/utils/rate-limit.js';

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const rateLimitKey = `endpoint:${clientAddress}:${identifier}`;
  if (isRateLimited(rateLimitKey, 10, 60 * 1000)) {
    const info = getRateLimitInfo(rateLimitKey) as { remaining: number; reset: number };
    return new Response(JSON.stringify({ 
      error: 'Too many requests',
      retryAfter: Math.ceil((info.reset - Date.now()) / 1000)
    }), { 
      status: 429,
      headers: { 
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((info.reset - Date.now()) / 1000))
      }
    });
  }
  // ... rest of endpoint
};
```

### Secure API Response
```typescript
import { secureJsonResponse } from '../../workers/utils/security-headers.js';

try {
  // ... your logic
  return secureJsonResponse({ ok: true, data }, 200);
} catch (err) {
  console.error('Operation failed:', err); // Server-side only
  return secureJsonResponse({ error: 'Server error' }, 500);
}
```

### Input Validation
```typescript
// String validation
if (!value || typeof value !== 'string') {
  return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400 });
}

const trimmed = value.trim();

if (trimmed.length === 0 || trimmed.length > 100) {
  return new Response(JSON.stringify({ error: 'Input must be 1-100 characters' }), { status: 400 });
}

// Whitelist validation
const allowedValues = ['option1', 'option2', 'option3'];
if (!allowedValues.includes(value)) {
  return new Response(JSON.stringify({ error: 'Invalid value' }), { status: 400 });
}
```

### Database Query
```typescript
// ✅ GOOD - Parameterized
const result = await env.DB.prepare(
  'SELECT * FROM users WHERE email = ? AND is_active = ?'
).bind(email, 1).first();

// ❌ BAD - String concatenation
const result = await env.DB.prepare(
  `SELECT * FROM users WHERE email = '${email}'` // NEVER DO THIS
).first();
```

### Admin-Only Endpoint
```typescript
import { ADMIN_EMAIL } from '../../consts';

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (locals.user.email !== ADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  // ... admin logic
};
```

## Security Headers to Add

Always include these headers in API responses:

```typescript
const headers = {
  'Content-Type': 'application/json',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
```

Or use the utility:
```typescript
import { secureJsonResponse } from '../../workers/utils/security-headers.js';
return secureJsonResponse(data, 200);
```

## Common Vulnerabilities to Avoid

1. **SQL Injection** - Always use parameterized queries
2. **XSS** - Sanitize/escape user content, use CSP headers
3. **CSRF** - Implement CSRF tokens (TODO)
4. **Sensitive Data Exposure** - Never return secrets/errors to client
5. **Broken Authentication** - Use strong passwords, rate limiting, secure tokens
6. **Security Misconfiguration** - Keep dependencies updated, use security headers
7. **XXE** - Don't parse untrusted XML (not applicable to this project)
8. **Broken Access Control** - Always verify user permissions
9. **Using Components with Known Vulnerabilities** - Run `npm audit`
10. **Insufficient Logging** - Log security events, but not sensitive data

## Testing Security

```bash
# Run tests
npm test

# Check for vulnerable dependencies
npm audit

# Fix vulnerabilities
npm audit fix
```

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Cloudflare Security Best Practices](https://developers.cloudflare.com/workers/platform/security/)
- Full audit: [docs/SECURITY_AUDIT.md](./SECURITY_AUDIT.md)
