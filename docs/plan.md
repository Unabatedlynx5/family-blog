Plan: Convert Astro family-blog into private friends & family social site

Date: 2025-12-16

Summary
- Convert the existing Astro blog into a private friends-and-family social site hosted on Cloudflare.
- Auth: password-based, admin-only account creation. Refresh token rotation with 30-day refresh token TTL. Access token short-lived.
- Chat: real-time global thread implemented with a Durable Object + WebSocket.
- Posts/feed: DB-backed posts with media uploads; preserve existing Markdown blog rendering as historical posts alongside DB posts.
- Media: proxied uploads through a Worker that validates and stores to R2.
- Database: D1 for users, posts, refresh_tokens, media metadata.

Confirmed choices
- Account creation: admin-only (no public signup).
- Real-time chat: Durable Object WebSocket for global thread.
- Refresh token TTL: 30 days (rotate on use; stored hashed in D1).
- Media upload method: proxied through a Worker endpoint (server-side validation), stored in R2.
- Markdown handling: preserve current Markdown rendering; show markdown posts as historical posts in the feed (merge on frontend).

High-level architecture
- Frontend: Astro Pages (existing project) with new pages/components: login, feed (composer + posts), chat, profile.
- API: Cloudflare Pages Functions (functions/) or a Worker project exposing endpoints under /api/* for auth, posts, media, feed, and chat bootstrap.
- Real-time: Durable Object class (GlobalChat) to manage WebSocket connections and message broadcasting.
- Storage: D1 (relational) for persistent data; R2 for media files; KV for ephemeral caches/rate-limits if needed.
- Bindings: update wrangler.json to bind D1, R2, Durable Object class, and ASSETS already present.

Core data model (minimum)
- users: id (uuid), email, password_hash, name, avatar_url, is_active (bool), created_at, created_by_admin (bool)
- refresh_tokens: id, user_id, token_hash, expires_at, created_at, revoked
- posts: id, user_id, content (text), media_refs (json array), source (enum: ui|markdown), created_at
- media: id, uploader_id, r2_key, mime_type, size, created_at
- chat messages (in DO memory; optionally persisted to D1): id, user_id, message, created_at

Authentication details
- Password hashing: bcrypt or argon2 (use a constant cost suitable for Cloudflare Workers environment).
- Login flow:
  - POST /api/auth/login {email, password}
  - Verify password -> create access JWT (short TTL, e.g., 15m) returned to client as JSON and set refresh token as Secure HttpOnly SameSite cookie with 30d TTL.
  - Refresh token: opaque random token, server stores hashed token in D1 with expires_at and rotation id.
- Refresh flow:
  - POST /api/auth/refresh uses cookie refresh token -> verify hash in D1 -> rotate (issue new refresh token, revoke old) -> return new access JWT.
- Logout:
  - POST /api/auth/logout -> revoke refresh token in D1 and clear cookie.
- Admin-only account creation:
  - Admin UI or script to create user records in D1 with hashed password. No public signup endpoint.

API endpoints (bare minimum)
- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- POST /api/admin/users (admin-only; create user)
- GET /api/feed?limit=&cursor= (returns merged feed: DB posts + markdown posts)
- GET /api/posts/:id
- POST /api/posts (requires auth; proxy media uploads via media endpoint)
- POST /api/media/upload (multipart/form-data or base64; Worker validates and writes to R2; returns r2_key)
- WebSocket bootstrap endpoint (Worker routes connect to Durable Object): /api/chat/connect

Durable Object design (GlobalChat)
- Single Durable Object instance (singleton) holds active WebSocket connections for the global thread.
- DO stores recent messages in memory and periodically persists to D1 (optional).
- When a client connects, DO authenticates user via access JWT (short TTL) included in the initial WS message or cookie header.
- Broadcast model: incoming message -> DO pushes to all connected sockets and optionally persists to D1.
- Message formats: { id, user_id, text, created_at }

Media upload flow (proxied)
- Client uploads file via POST /api/media/upload (includes auth cookie or Bearer token).
- Worker validates content-type, size, and any file name rules.
- Worker writes to R2 (generate an internal r2_key/path), returns metadata (r2_key, public URL path or signed URL) to client.
- Posts reference media by r2_key; feed renderer resolves to ASSETS or R2 public URL via Worker.

Markdown posts preservation
- Keep current server-side Markdown rendering for pages under /blog/* as-is.
- Frontend feed will request /api/feed which merges results from D1 posts and server-rendered markdown posts. Two options to merge:
  - Option A (recommended initially): Fetch markdown posts at build-time or via a small Pages Function that reads markdown files and returns them as part of the feed (no DB migration). This keeps current Markdown files authoritative.
  - Option B: One-time migration script that reads markdown files and inserts them into D1 with source=markdown (if you want them in DB). (We will start with Option A to keep changes minimal.)

Wrangler / bindings (changes required)
- Add D1 database bindings (databases array) with a name and environment binding.
- Add R2 binding in `r2_buckets` array.
- Add Durable Object binding in `durable_objects` with class name GlobalChat.
- Keep ASSETS binding as-is.
- Do NOT commit secrets (JWT_SECRET, etc.) to repository; set them in Pages/Workers environment settings.

Example (illustrative only; do not apply credentials here)
- In wrangler.json add keys: "databases": [{ "binding": "DB", "database_name": "family_blog_db" }], "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "family-blog-media" }], "durable_objects": { "bindings": [{ "name": "GLOBAL_CHAT", "class_name": "GlobalChat" }] }

Deployment steps (macOS zsh commands, high-level)
1. Install wrangler: npm i -g wrangler
2. Login: wrangler login
3. Create D1 DB: wrangler d1 create family_blog_db
4. Create R2 bucket (from Dashboard or wrangler if available)
5. Create Durable Object class binding when adding Worker script (wrangler will handle class creation)
6. Add secrets in Cloudflare dashboard: JWT_SECRET, BCRYPT_COST (optional), ADMIN_API_KEY (for admin actions)
7. Add code (functions/ and workers/) and migrations
8. Run migrations/seed scripts (node scripts/run_migrations.js or call a migration Worker)
9. Seed admin user via script or admin UI
10. Commit & push; Cloudflare Pages will build and deploy

Minimal roadmap & milestones
- MVP (barebones):
  - Auth (login, refresh, logout) with admin account creation
  - Posts CRUD + feed endpoint
  - Media upload proxy -> R2
  - Chat via Durable Object WebSocket (basic broadcast)
  - Merge markdown posts into feed via a Pages Function that reads md files
- Follow-ups (later): comments/likes, email invites, moderation tools, user profiles, search, pagination improvements, rate limits, tests, CI.

Security & privacy notes
- Store password hashes, never plaintext.
- Store refresh tokens hashed in D1; rotate on use.
- Use Secure, HttpOnly, SameSite cookies for refresh tokens.
- Validate uploads (size, mime), scan if needed.
- Admin-only creation reduces spam risk.

Next steps for me after you confirm this plan
1. Create exact file list to add/edit.
2. Add SQL migration file(s) for D1.
3. Implement Worker templates for auth, posts, media, feed, and Durable Object for chat.
4. Add minimal Astro pages/components (login, feed, chat, composer).
5. Update wrangler.json with binding placeholders (no secrets).
6. Provide a deployment checklist and commands; help run migrations and seed admin user.

Questions remaining (small)
- Preferred admin provisioning method: CLI script or a protected admin UI endpoint? (recommend CLI/script to avoid additional UI.)

If you approve this plan I will generate the exact file-change plan and begin implementing the MVP files.
