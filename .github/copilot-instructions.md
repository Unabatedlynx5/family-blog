# GitHub Copilot instructions — family-blog

Purpose: give an AI coding agent the minimal, actionable knowledge to be productive in this repo.

- **Big picture**: This is an Astro site (frontend + static pages) with Cloudflare Pages Functions used for server endpoints. Server/runtime pieces live under `src/pages/api/` (mapped to `/api/*` at runtime) and real-time chat is implemented as a Cloudflare Durable Object in a separate worker (`family-blog-chat`).
- **Data & storage**: D1 (SQLite) is the primary DB; migrations live in `migrations/` (e.g. `migrations/001_init.sql`). Media files are stored in R2; upload handling is in `src/pages/api/media/upload.ts`.
- **Auth pattern**: JWT access tokens (15m) + refresh tokens with rotation (30d). Refresh tokens are hashed (SHA-256). Admin-only creation uses the `x-admin-key` header handled by `src/pages/api/admin/users.ts`.

- **Key entry points & examples**:
  - API auth: [src/pages/api/auth/login.ts](../src/pages/api/auth/login.ts)
  - Refresh/logout: [src/pages/api/auth/refresh.ts](../src/pages/api/auth/refresh.ts) and [src/pages/api/auth/logout.ts](../src/pages/api/auth/logout.ts)
  - Media upload: [src/pages/api/media/upload.ts](../src/pages/api/media/upload.ts)
  - WebSocket connect (Durable Object): [src/pages/api/chat/connect.ts](../src/pages/api/chat/connect.ts) (connects to external `family-blog-chat` worker)
  - Feed/posts API: [src/pages/api/feed.ts](../src/pages/api/feed.ts), [src/pages/api/posts/index.ts](../src/pages/api/posts/index.ts)

- **Developer workflows**:
  - Install: `npm install`
  - Local dev (Astro): `npm run dev` (serves at localhost:4321)
  - Build: `npm run build` (produces `./dist/`)
  - Preview with Wrangler: `npm run preview` (build + `wrangler dev`)
  - Deploy: `npm run deploy` (`wrangler deploy`) — ensure Cloudflare bindings in `wrangler.json` are up-to-date
  - Generate Cloudflare types: `npm run cf-typegen` (runs `wrangler types`)

- **Testing & CI**:
  - Tests use Vitest. Commands: `npm test`, `npm run test:watch`, `npm run test:coverage`.
  - Tests mock D1 and R2 (see `tests/README.md`) — unit/integration files are in `tests/` (e.g. `tests/auth.test.js`, `tests/chat.test.js`).

- **Conventions & patterns** (project-specific)
  - API routes live under `src/pages/api/` and map directly to `/api/*` routes; prefer existing helpers and types for env/bindings in `env.d.ts`.
  - Server code expects Cloudflare bindings (D1, R2, Durable Objects). Update `wrangler.json` when adding bindings and re-run `npm run cf-typegen`.
  - Admin-only endpoints require `x-admin-key` header; authentication uses `Authorization: Bearer <token>` and HttpOnly cookies for refresh tokens.
  - Content collections: Markdown/MDX blog content lives under `src/content/blog/` and is consumed via `getCollection()`.

- **When you change runtime bindings or env names**:
  1. Update `wrangler.json` bindings.
  2. Run `npm run cf-typegen` to refresh types.
  3. Update `env.d.ts` if necessary.
  4. Run `npm test` to validate.

- **Database Migrations**:
  - When applying a new migration file (e.g. `migrations/XXX_name.sql`), you MUST also record it in the `d1_migrations` table to track applied migrations.
  - Example: `wrangler d1 execute family_blog_db --remote --command "INSERT INTO d1_migrations (name) VALUES ('XXX_name.sql');"`

- **Where to look first when debugging**:
  - Local dev: `npm run dev` (Astro) — console shows serverless function errors.
  - Worker/Durable Object logic: Check `family-blog-chat` repository.
  - Database issues: `migrations/` SQL and code that calls D1 in `src/pages/api/*`.

- **Git & PR Workflow**:
  - **Branching**: Create a new branch for changes using the format `feature/<feature-name>`.
  - **Pull Requests**: Automatically create a PR into `main` for these branches.
  - **PR Summary**: Include a summary of files changed and features added in the PR description/comments.

- **Current Focus & Todo**:
  - [x] Implement password reset flow (email + token).
  - [x] Improve error handling and logging for Durable Object connections.
  - [x] Improve test coverage for chat Durable Object (especially edge cases).
  - [x] Improve test coverage for media upload and R2 interactions.
  - [x] Add end-to-end tests for key user flows (auth, posting, chat).
  - [x] Add "signing in..." after the user submits login form.
  - [x] Add user profile pictures stored in R2 and displayed in chat and comments.
  - [x] Add birthday to settings, and correctly update birthday on social layout.
  - [x] Fix user profile picture upload to default to the user who is logged in.
  - [x] Fix server errors when saving settings without changing profile picture and other fields.
  - [x] Fix email not displaying correctly in settings page after update.
  - [x] Add color change on hover for adding picture to post.
  - [ ] Implement user presence indicators in chat (online/offline).
    - [ ] Implement online status indicators.
  - [ ] Add a toolbar for editing blog posts and make a user friendly way to add markdown content. (i.e. bold, underline, headings, links, images, etc.)
  - [ ] Implement rich text editor for blog posts with live preview.
  - [ ] Improve admin page UX for managing users (search, filter, pagination).
  - [ ] Implement astro mdx features for blog posts (like syntax highlighting).
  - [ ] Add comment functionality to blog posts.
    - [ ] Add liking functionality to chat messages and comments.
  - [ ] Add pagination to feed/posts API endpoints.
  - [ ] Optimize D1 queries and add indexes where needed.
  - [ ] Implement caching for frequently accessed data (e.g., blog posts).
  - [ ] Add blog button to social layout for easy access. 
  - [ ] Add recipe button for recipe content in the future.
  - [ ] Create members page
    - [ ] Create `src/pages/members.astro` route and layout.
    - [ ] Create `src/pages/api/members/index.ts` endpoint to fetch active users.
    - [ ] Design member card component (Avatar, Name, Bio).
    - [ ] Implement grid layout for member list.
  - [ ] Create photos page
    - [ ] Create `src/pages/photos.astro` route.
    - [ ] Create `src/pages/api/media/gallery.ts` to fetch all image media.
    - [ ] Implement masonry or grid layout for photos.
    - [ ] Add lightbox/modal for viewing full-size images.
    - [ ] Add pagination or infinite scroll for the gallery.
  - [ ] Create calendar page
    - [ ] Create `src/pages/calendar.astro` route.
    - [ ] Create `src/pages/api/calendar/events.ts` to fetch birthdays and events.
    - [ ] Implement calendar view component (Month view).
    - [ ] Display user birthdays on the calendar.
    - [ ] Add functionality to create custom events (requires DB migration).
  - [ ] Add rate limiting to auth endpoints to mitigate brute-force attacks.


References: README ([README.md](../README.md)), test guide ([tests/README.md](../tests/README.md)), `package.json` scripts ([package.json](../package.json)).

If anything is unclear or you'd like more detail (examples of request/response shapes or typical test mocks), tell me which part to expand. 