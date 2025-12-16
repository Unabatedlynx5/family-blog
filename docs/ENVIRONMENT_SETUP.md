# Environment Variables & Secrets Setup

## Overview

This project uses environment variables and secrets to store sensitive configuration. Different approaches are used for local development vs production deployment.

## Local Development (`.dev.vars`)

For local development with `wrangler dev`, secrets are stored in the `.dev.vars` file:

### Setup

1. Copy the example file:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Edit `.dev.vars` and add your values:
   ```
   JWT_SECRET=your-jwt-secret-here
   ADMIN_API_KEY=your-admin-api-key-here
   ```

3. Generate secure secrets:
   ```bash
   # Generate JWT_SECRET (32+ characters)
   openssl rand -base64 32
   
   # Generate ADMIN_API_KEY (24+ characters)
   openssl rand -base64 24
   ```

### Current Values (for reference)

```
JWT_SECRET=rSWZPa07nkARr6lzYUyB/oPmbRvLLsEgQnu3M3jbyXY=
ADMIN_API_KEY=fH0+709DsWRIFRydYQGSsz80KCCcq/gb
```

**⚠️ Note:** `.dev.vars` is gitignored and will never be committed to version control.

## Production Deployment (Cloudflare Secrets)

For production deployment, secrets are stored securely in Cloudflare Workers using the `wrangler secret` command.

### Current Status

✅ **Secrets are already set!** The following secrets have been configured:
- `JWT_SECRET`
- `ADMIN_API_KEY`

### To Update Secrets

If you need to change a secret in production:

```bash
# Update JWT_SECRET
echo "new-jwt-secret-value" | npx wrangler secret put JWT_SECRET

# Update ADMIN_API_KEY
echo "new-admin-key-value" | npx wrangler secret put ADMIN_API_KEY
```

### To List Secrets

```bash
npx wrangler secret list
```

### To Delete Secrets

```bash
npx wrangler secret delete JWT_SECRET
npx wrangler secret delete ADMIN_API_KEY
```

## How Secrets Are Accessed

In your code, secrets are accessed via the `env` object:

```typescript
// In API routes
const env = locals.runtime.env as any;

// Access secrets (can use await or direct access)
const jwtSecret = await env.JWT_SECRET;
const adminKey = await env.ADMIN_API_KEY;

// Or without await (works for both)
const jwtSecret = env.JWT_SECRET;
const adminKey = env.ADMIN_API_KEY;
```

## Security Best Practices

### ✅ DO:
- Use `.dev.vars` for local development
- Use `wrangler secret` for production
- Generate strong, random secrets
- Keep `.dev.vars` in `.gitignore`
- Rotate secrets periodically
- Use different secrets for dev/staging/production

### ❌ DON'T:
- Commit secrets to git
- Share secrets in plain text
- Use weak or predictable secrets
- Store secrets in `wrangler.json` (use `wrangler secret` instead)
- Reuse secrets across different projects

## Environment Variables vs Secrets

### Environment Variables (`vars` in wrangler.json)
- ✅ Use for: Non-sensitive configuration
- ✅ Example: API endpoints, feature flags, public keys
- ⚠️ Visible in dashboard and logs

### Secrets (`wrangler secret`)
- ✅ Use for: Sensitive data
- ✅ Example: API keys, passwords, JWT secrets, private keys
- ✅ Encrypted at rest
- ✅ Not visible in logs or dashboard

## Troubleshooting

### "Unauthorized" error when creating users
- Check that `ADMIN_API_KEY` is set correctly
- Verify you're using the correct key value
- Run `npx wrangler secret list` to confirm secrets exist

### "Invalid token" errors
- Check that `JWT_SECRET` matches between environments
- Regenerate tokens if JWT_SECRET was changed
- Clear browser cookies and login again

### Secrets not working after deployment
- Wait 30-60 seconds for secrets to propagate
- Redeploy: `npm run deploy`
- Check worker logs: `npx wrangler tail`

## Deployment Checklist

Before deploying to production:

1. ✅ Secrets are set via `wrangler secret put`
2. ✅ `.dev.vars` exists locally (for development)
3. ✅ `.dev.vars` is in `.gitignore`
4. ✅ No secrets in `wrangler.json`
5. ✅ Secrets are documented in `.dev.vars.example`

## Current Configuration

Your project is now properly configured:

- ✅ `.dev.vars` - Contains development secrets (gitignored)
- ✅ `.dev.vars.example` - Template for other developers
- ✅ `wrangler.json` - No secrets stored here ✓
- ✅ Cloudflare Secrets - Production secrets set via `wrangler secret`
- ✅ `.gitignore` - Prevents committing secrets

## Testing

Test that secrets are working:

```bash
# Test admin user creation
curl -X POST https://family-blog.frankrobertdenton.workers.dev/api/admin/users \
  -H 'Content-Type: application/json' \
  -H 'x-admin-key: YOUR_ADMIN_API_KEY' \
  -d '{"email":"test@example.com","password":"TestPass123","name":"Test"}'

# Expected: {"ok":true,"id":"some-uuid"}
```

## References

- [Cloudflare Workers Secrets Documentation](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Environment Variables Best Practices](https://developers.cloudflare.com/workers/configuration/environment-variables/)
