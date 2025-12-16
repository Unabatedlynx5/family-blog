# Pre-Deployment Checklist

Complete this checklist before deploying to production.

## ☐ 1. Dependencies

```bash
npm install
```

Verify all required packages are installed:
- [ ] bcryptjs
- [ ] jsonwebtoken
- [ ] @astrojs/cloudflare
- [ ] wrangler

## ☐ 2. Run Tests

```bash
npm test
```

Ensure all tests pass before deployment.

## ☐ 3. Cloudflare Resources

### D1 Database
```bash
# Create D1 database (if not already created)
wrangler d1 create family_blog_db

# Note the database_id and update wrangler.json if needed
```

### R2 Bucket
- [ ] Create R2 bucket named `family-blog-media` in Cloudflare dashboard
- [ ] Verify bucket name matches `wrangler.json`

### Environment Variables
Set these in Cloudflare Dashboard → Workers & Pages → Your Site → Settings → Environment Variables:

- [ ] `JWT_SECRET` - Generate a secure random string (min 32 characters)
  ```bash
  # Generate one with:
  openssl rand -base64 32
  ```
- [ ] `ADMIN_API_KEY` - Secret key for admin operations
  ```bash
  # Generate one with:
  openssl rand -base64 32
  ```

## ☐ 4. Run Migrations

### Remote (Production) Database
```bash
wrangler d1 execute family_blog_db --remote --file=./migrations/001_init.sql
```

### Local Database (for development)
```bash
wrangler d1 execute family_blog_db --local --file=./migrations/001_init.sql
```

## ☐ 5. Create Admin User

You need at least one admin user to create other accounts. Choose one method:

### Method A: Use the admin API endpoint

After deployment, make a POST request:

```bash
curl -X POST https://your-site.pages.dev/api/admin/users \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_API_KEY" \
  -d '{
    "email": "admin@example.com",
    "password": "secure-password-here",
    "name": "Admin User"
  }'
```

### Method B: Use local script (development only)

```bash
# First, create local database
wrangler d1 execute family_blog_db --local --file=./migrations/001_init.sql

# Then run seed script
D1_DB_PATH=./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/[db-id].sqlite \
  node scripts/seed_admin.js admin@example.com yourpassword
```

## ☐ 6. Test Build

```bash
npm run build
```

Verify the build completes without errors.

## ☐ 7. Test Locally

```bash
npm run preview
```

Test locally:
- [ ] Visit http://localhost:8788
- [ ] Try logging in with admin credentials
- [ ] Create a test post
- [ ] Upload test media
- [ ] Check feed displays correctly
- [ ] Test logout

## ☐ 8. Review Configuration Files

### wrangler.json
- [ ] `name` matches your project
- [ ] `database_id` is correct for your D1 database
- [ ] `bucket_name` matches your R2 bucket
- [ ] Durable Object binding is present

### package.json
- [ ] Version is appropriate
- [ ] All dependencies are listed

## ☐ 9. Security Review

- [ ] JWT_SECRET is set and secure (not default value)
- [ ] ADMIN_API_KEY is set and secure
- [ ] No secrets committed to git
- [ ] Refresh tokens are hashed in database
- [ ] Passwords are hashed with bcrypt
- [ ] All API endpoints have proper authentication

## ☐ 10. Deploy

```bash
npm run deploy
```

Or via Cloudflare Pages:
```bash
git push origin main
# Cloudflare Pages will auto-deploy
```

## ☐ 11. Post-Deployment Verification

After deployment, verify:

### Authentication
```bash
# Test login
curl -X POST https://your-site.pages.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "yourpassword"}'
```

### Create Post (with token from login)
```bash
curl -X POST https://your-site.pages.dev/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"content": "Test post", "media_refs": []}'
```

### Check Feed
```bash
curl https://your-site.pages.dev/api/feed
```

### Check Chat WebSocket
- [ ] Visit chat page and verify WebSocket connects
- [ ] Send a test message
- [ ] Verify message appears

## ☐ 12. Monitor

- [ ] Check Cloudflare dashboard for errors
- [ ] Monitor D1 database usage
- [ ] Monitor R2 storage usage
- [ ] Check Durable Object metrics

## ☐ 13. Documentation

- [ ] Update README.md with deployment URL
- [ ] Share login instructions with family/friends
- [ ] Document any custom configuration

## Troubleshooting

### Issue: "Database not found"
**Solution**: Ensure D1 database is created and migrations are run

### Issue: "R2 bucket not found"
**Solution**: Create the R2 bucket in Cloudflare dashboard

### Issue: "Durable Object not found"
**Solution**: Verify wrangler.json has correct Durable Object binding

### Issue: "Invalid token"
**Solution**: Check JWT_SECRET is set correctly in environment variables

### Issue: "Upload failed"
**Solution**: Verify R2 bucket permissions and binding name

## Rollback Plan

If issues occur after deployment:

1. Revert to previous deployment in Cloudflare dashboard
2. Or redeploy previous git commit:
   ```bash
   git revert HEAD
   git push origin main
   ```

## Success Criteria

Deployment is successful when:
- ✅ All tests pass
- ✅ Build completes without errors
- ✅ Admin can log in
- ✅ Posts can be created and viewed
- ✅ Media can be uploaded
- ✅ Feed displays correctly
- ✅ Chat WebSocket connects
- ✅ No errors in Cloudflare logs

---

**Last Updated**: December 16, 2025
