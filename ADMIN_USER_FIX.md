# Admin User Creation Fix

## Problem
The ADMIN_API_KEY environment variable in Cloudflare doesn't match the key we generated.

## Solution

You need to set the environment variable in the Cloudflare dashboard with the EXACT value we generated.

### Step 1: Set Environment Variables in Cloudflare Dashboard

1. Go to: https://dash.cloudflare.com
2. Navigate to: **Workers & Pages** → **family-blog** → **Settings** → **Variables**
3. Look for existing variables `JWT_SECRET` and `ADMIN_API_KEY`
4. Either edit them or delete and recreate with these EXACT values:

**JWT_SECRET:**
```
rSWZPa07nkARr6lzYUyB/oPmbRvLLsEgQnu3M3jbyXY=
```

**ADMIN_API_KEY:**
```
fH0+709DsWRIFRydYQGSsz80KCCcq/gb
```

5. Make sure both are set as **"Encrypt" / "Secret"** type
6. Click **"Save and Deploy"**

### Step 2: Test Admin User Creation

After saving the environment variables, wait about 30 seconds for the deployment to propagate, then run:

```bash
curl -X POST https://family-blog.frankrobertdenton.workers.dev/api/admin/users \
  -H 'Content-Type: application/json' \
  -H 'x-admin-key: fH0+709DsWRIFRydYQGSsz80KCCcq/gb' \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123!",
    "name": "Admin User"
  }'
```

You should see:
```json
{"ok":true,"id":"some-uuid-here"}
```

### Step 3: Test Login

Once the admin user is created, test logging in:

```bash
curl -X POST https://family-blog.frankrobertdenton.workers.dev/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123!"
  }'
```

You should see:
```json
{"accessToken":"jwt-token-here","user":{"id":"...","email":"admin@example.com","name":"Admin User"}}
```

## Alternative: Use Wrangler CLI to Set Secrets

If the dashboard method doesn't work, you can set secrets via CLI:

```bash
# Set JWT_SECRET
echo "rSWZPa07nkARr6lzYUyB/oPmbRvLLsEgQnu3M3jbyXY=" | npx wrangler secret put JWT_SECRET

# Set ADMIN_API_KEY  
echo "fH0+709DsWRIFRydYQGSsz80KCCcq/gb" | npx wrangler secret put ADMIN_API_KEY
```

Then test again with the curl command above.

## Troubleshooting

If you still get `{"error":"Unauthorized"}`:

1. Check the environment variables are exactly as shown above (no extra spaces or line breaks)
2. Wait 30-60 seconds after saving for changes to propagate
3. Try the wrangler CLI method instead
4. View logs: `npx wrangler tail` then run the curl command to see any error messages

## Once It Works

After successfully creating an admin user:

1. Visit: https://family-blog.frankrobertdenton.workers.dev/login
2. Log in with your admin credentials
3. Access the admin panel at /admin
4. Start creating blog posts!
