# Local Development Environment Setup

This guide helps you set up environment variables for local development.

## Quick Setup (Automated)

Run the setup script to automatically generate and configure environment variables:

```bash
chmod +x scripts/setup_env.sh
./scripts/setup_env.sh
```

This will:
- Generate secure random secrets for `JWT_SECRET` and `ADMIN_API_KEY`
- Create `.dev.vars` for Wrangler (used by `npm run preview`)
- Create `.env` for Astro (used by `npm run dev`)
- Both files are gitignored and safe for local development

## Manual Setup

If you prefer to set up manually:

### 1. Generate Secrets

```bash
# Generate JWT_SECRET
openssl rand -base64 32

# Generate ADMIN_API_KEY
openssl rand -base64 32
```

### 2. Create `.dev.vars` (for Wrangler)

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and add your secrets:

```env
JWT_SECRET=your-generated-jwt-secret
ADMIN_API_KEY=your-generated-admin-key
ENVIRONMENT=development
```

### 3. Create `.env` (for Astro)

```bash
cp .env.example .env
```

Edit `.env` and add the same secrets:

```env
JWT_SECRET=your-generated-jwt-secret
ADMIN_API_KEY=your-generated-admin-key
ENVIRONMENT=development
```

## Development Servers

### Option 1: Astro Dev Server (Faster, Limited Features)

```bash
npm run dev
```

- **Pros**: Fast hot reload, good for frontend work
- **Cons**: No D1, R2, or Durable Objects access
- **Uses**: `.env` file
- **URL**: http://localhost:4321

### Option 2: Wrangler Dev (Full Cloudflare Environment)

```bash
npm run preview
```

- **Pros**: Full Cloudflare bindings (D1, R2, Durable Objects)
- **Cons**: Slower, requires build step
- **Uses**: `.dev.vars` file
- **URL**: http://localhost:8788 (or similar)

## Creating Your First Admin User

After starting the dev server, create an admin user:

```bash
npm run seed:admin
```

Or manually:

```bash
curl -X POST http://localhost:4321/api/admin/users \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_API_KEY" \
  -d '{
    "email": "admin@familyblog.com",
    "password": "SecurePassword123!",
    "name": "Admin User"
  }'
```

## Environment Variables Reference

| Variable | Purpose | Example | Required |
|----------|---------|---------|----------|
| `JWT_SECRET` | Signs JWT access tokens | `abc123...` (32+ bytes) | Yes |
| `ADMIN_API_KEY` | Authorizes admin operations | `xyz789...` (32+ bytes) | Yes |
| `ENVIRONMENT` | Environment identifier | `development` or `production` | No |

## Verifying Setup

### Check Environment Variables are Loaded

```bash
# Start dev server
npm run preview

# In another terminal, test the debug endpoint (requires admin auth)
curl http://localhost:8788/api/debug
```

Should return something like:
```json
{
  "hasAdminKey": true,
  "hasJWTSecret": true,
  "hasDB": true,
  "hasMediaBucket": true,
  "message": "Environment check complete"
}
```

## Troubleshooting

### Problem: "JWT_SECRET not defined"

**Solution**: 
- Make sure `.dev.vars` exists (for wrangler)
- Make sure `.env` exists (for astro dev)
- Restart your dev server

### Problem: "Cannot connect to D1"

**Solution**: 
- Use `npm run preview` instead of `npm run dev`
- Astro dev server doesn't support Cloudflare bindings

### Problem: ".dev.vars changes not reflected"

**Solution**: Restart the wrangler dev server:
```bash
# Kill existing process
# Restart
npm run preview
```

### Problem: "Admin API key invalid"

**Solution**: Make sure the `x-admin-key` header matches the value in `.dev.vars` or `.env`

## Production Deployment

⚠️ **IMPORTANT**: Do NOT use local development secrets in production!

For production deployment:

1. Generate NEW secrets (different from development):
   ```bash
   openssl rand -base64 32  # For JWT_SECRET
   openssl rand -base64 32  # For ADMIN_API_KEY
   ```

2. Add to Cloudflare Dashboard:
   - Go to: https://dash.cloudflare.com
   - Navigate: Workers & Pages → family-blog → Settings → Variables
   - Add as **encrypted secrets**:
     - `JWT_SECRET`
     - `ADMIN_API_KEY`
     - `ENVIRONMENT=production`

3. Deploy:
   ```bash
   npm run deploy
   ```

## Security Notes

- ✅ `.dev.vars` and `.env` are gitignored
- ✅ Never commit secrets to version control
- ✅ Use different secrets for development and production
- ✅ Rotate secrets periodically
- ⚠️ Don't share your `.dev.vars` or `.env` files

## Files Overview

```
family-blog/
├── .env.example          # Template for .env (gitignored template)
├── .dev.vars.example     # Template for .dev.vars (gitignored template)
├── .env                  # Your actual secrets (gitignored, created by you)
├── .dev.vars             # Your actual secrets (gitignored, created by you)
└── scripts/
    └── setup_env.sh      # Automated setup script
```

## Next Steps

After setting up environment variables:

1. ✅ Run `npm run preview` to start dev server
2. ✅ Create admin user with `npm run seed:admin`
3. ✅ Visit http://localhost:8788/login
4. ✅ Start developing!

For more information:
- [README.md](../README.md) - Project overview
- [docs/DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - Production deployment
- [docs/SECURITY_QUICK_REFERENCE.md](./SECURITY_QUICK_REFERENCE.md) - Security best practices
