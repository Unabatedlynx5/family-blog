# Security Audit - Verification Checklist

Use this checklist to verify all security fixes are working correctly.

## Pre-Deployment Verification

### 1. Code Review
- [ ] Review all changed files in `src/pages/api/`
- [ ] Verify no sensitive data in error responses
- [ ] Confirm all queries use parameterized statements
- [ ] Check input validation is comprehensive

### 2. Local Testing
```bash
# Run test suite
npm test

# Should see: ✅ All 38 tests passing
```

### 3. Environment Setup
- [ ] `JWT_SECRET` set (32+ byte random string)
- [ ] `ADMIN_API_KEY` set (32+ byte random string)
- [ ] `ENVIRONMENT=production` (for production deployment)

## Post-Deployment Testing

### Test 1: Debug Endpoint Security ✅
```bash
# Should return 401 Unauthorized
curl https://your-site.pages.dev/api/debug

# With admin auth should return booleans only (no secret prefixes)
curl https://your-site.pages.dev/api/debug \
  -H "Cookie: accessToken=YOUR_ADMIN_TOKEN"

# Expected: {"hasAdminKey":true,"hasJWTSecret":true,...}
# NOT: {"adminKeyPrefix":"abc123...", ...}
```

### Test 2: Rate Limiting ✅
```bash
# Attempt to login 6+ times with wrong password
for i in {1..6}; do
  curl -X POST https://your-site.pages.dev/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
  echo "\nAttempt $i"
done

# Attempt 6 should return:
# Status: 429 Too Many Requests
# Body: {"error":"Too many login attempts...","retryAfter":900}
# Header: Retry-After: 900
```

### Test 3: Password Reset Token Logging ✅
```bash
# Request password reset
curl -X POST https://your-site.pages.dev/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@familyblog.com"}'

# Check Cloudflare logs - should NOT see full token
# ✅ Should see: "[Password Reset] Token generated for user {user_id}"
# ❌ Should NOT see: "[Password Reset] Link for ... token=abc123..."
```

### Test 4: Error Message Safety ✅
```bash
# Trigger an error (invalid JSON)
curl -X POST https://your-site.pages.dev/api/admin/users \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_KEY" \
  -d 'invalid json'

# Expected: {"error":"Invalid JSON"}
# NOT: {"error":"Server error","details":"Unexpected token..."}
```

### Test 5: Input Validation ✅

#### Profile Name Validation
```bash
# Too long name (>100 chars)
curl -X POST https://your-site.pages.dev/api/user/profile \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"'$(python3 -c "print('a'*101)")'"}'

# Expected: 400 Bad Request
# Body: {"error":"Name must be 100 characters or less"}
```

#### Chat Message Validation
```bash
# Too long message (>5000 chars)
curl -X POST https://your-site.pages.dev/api/chat/messages \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"'$(python3 -c "print('a'*5001)")'"}'

# Expected: 400 Bad Request
# Body: {"error":"Message too long (max 5000 characters)"}
```

### Test 6: File Upload Security ✅
```bash
# Try uploading non-image file with .jpg extension
echo "Not an image" > test.jpg
curl -X POST https://your-site.pages.dev/api/media/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test.jpg"

# Should validate MIME type and reject
# Expected: 400 Bad Request
```

### Test 7: Settings Validation ✅
```bash
# Try invalid theme value
curl -X POST https://your-site.pages.dev/api/settings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"theme":"hacker","language":"en"}'

# Should default to "light" (not save "hacker")
# Verify by GET /api/settings
```

## Database Verification

### Check Migration Applied
```bash
# Check indexes exist
wrangler d1 execute family_blog_db --remote \
  --command "SELECT name FROM sqlite_master WHERE type='index';"

# Should see:
# - idx_refresh_tokens_hash
# - idx_users_email
# - idx_password_reset_tokens
# - idx_media_uploader
# - idx_posts_user
# - idx_chat_messages_created

# Verify migration recorded
wrangler d1 execute family_blog_db --remote \
  --command "SELECT * FROM d1_migrations WHERE name='007_add_indexes.sql';"
```

## Security Headers Verification

### Check Response Headers
```bash
curl -I https://your-site.pages.dev/api/settings

# Should include (if using secureJsonResponse):
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# X-XSS-Protection: 1; mode=block
# Referrer-Policy: strict-origin-when-cross-origin
```

## Monitoring Setup

### Cloudflare Logs
- [ ] Access Cloudflare dashboard
- [ ] Navigate to Analytics > Logs
- [ ] Verify logs are being captured
- [ ] Check for any error spikes after deployment

### Error Tracking (If Configured)
- [ ] Sentry/other error tracking active
- [ ] Test error is captured
- [ ] Verify sensitive data NOT in error reports

## Rollback Plan

If issues found after deployment:

### Quick Rollback
```bash
# Revert to previous deployment
wrangler rollback

# Or deploy previous version
git checkout <previous-commit>
npm run deploy
```

### Database Rollback (If Needed)
```sql
-- Only if indexes cause issues (unlikely)
DROP INDEX IF EXISTS idx_refresh_tokens_hash;
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_password_reset_tokens;
DROP INDEX IF EXISTS idx_media_uploader;
DROP INDEX IF EXISTS idx_posts_user;
DROP INDEX IF EXISTS idx_chat_messages_created;
```

## Sign-Off

After all tests pass:

- [ ] ✅ All security fixes verified working
- [ ] ✅ No regressions found
- [ ] ✅ Database migrations applied
- [ ] ✅ Monitoring configured
- [ ] ✅ Documentation updated

**Verified By**: ________________  
**Date**: ________________  
**Environment**: [ ] Development [ ] Staging [ ] Production

---

## Common Issues & Solutions

### Issue: Rate limiting not working
**Solution**: Check clientAddress is available in context. May need to use `request.headers.get('CF-Connecting-IP')` in production.

### Issue: Tests passing but production failing
**Solution**: Check environment variables are set in Cloudflare dashboard, not just locally.

### Issue: Database indexes causing slow queries
**Solution**: Unlikely, but can drop indexes if needed (see rollback plan above).

---

## Additional Resources

- Full Audit: [SECURITY_AUDIT.md](./SECURITY_AUDIT.md)
- Quick Reference: [SECURITY_QUICK_REFERENCE.md](./SECURITY_QUICK_REFERENCE.md)
- Fix Summary: [SECURITY_FIXES_SUMMARY.md](./SECURITY_FIXES_SUMMARY.md)
