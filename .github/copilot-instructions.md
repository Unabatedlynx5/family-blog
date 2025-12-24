# GitHub Copilot instructions — family-blog

Purpose: give an AI coding agent the minimal, actionable knowledge to be productive in this repo.

- **Big picture**: This is an Astro site (frontend + static pages) with Cloudflare Pages Functions used for server endpoints. Server/runtime pieces live under `src/pages/api/` (mapped to `/api/*` at runtime) and real-time chat is implemented as a Cloudflare Durable Object in `workers/GlobalChat.js`.
- **Data & storage**: D1 (SQLite) is the primary DB; migrations live in `migrations/` (e.g. `migrations/001_init.sql`). Media files are stored in R2; upload handling is in `src/pages/api/media/upload.ts`.
- **Auth pattern**: JWT access tokens (15m) + refresh tokens with rotation (30d). Refresh tokens are hashed (SHA-256). Admin-only creation uses the `x-admin-key` header handled by `src/pages/api/admin/users.ts`.

- **Key entry points & examples**:
  - API auth: [src/pages/api/auth/login.ts](src/pages/api/auth/login.ts)
  - Refresh/logout: [src/pages/api/auth/refresh.ts](src/pages/api/auth/refresh.ts) and [src/pages/api/auth/logout.ts](src/pages/api/auth/logout.ts)
  - Media upload: [src/pages/api/media/upload.ts](src/pages/api/media/upload.ts)
  - WebSocket connect (Durable Object): [src/pages/api/chat/connect.ts](src/pages/api/chat/connect.ts) and [workers/GlobalChat.js](workers/GlobalChat.js)
  - Feed/posts API: [src/pages/api/feed.ts](src/pages/api/feed.ts), [src/pages/api/posts/index.ts](src/pages/api/posts/index.ts)

- **Developer workflows**:
  - Install: `npm install`
  - Local dev (Astro): `npm run dev` (serves at localhost:4321)
  - Build: `npm run build` (produces `./dist/` and runs `scripts/append_do_export.js` postbuild)
  - Preview with Wrangler: `npm run preview` (build + `wrangler dev`)
  - Deploy: `npm run deploy` (`wrangler deploy`) — ensure Cloudflare bindings in `wrangler.json` are up-to-date
  - Generate Cloudflare types: `npm run cf-typegen` (runs `wrangler types`)

- **Testing & CI**:
  - Tests use Vitest. Commands: `npm test`, `npm run test:watch`, `npm run test:coverage`.
  - Tests mock D1 and R2 (see `tests/README.md`) — unit/integration files are in `tests/` (e.g. `tests/auth.test.js`, `tests/chat.test.js`).

- **Conventions & patterns** (project-specific)
  - API routes live under `src/pages/api/` and map directly to `/api/*` routes; prefer existing helpers and types for env/bindings in `env.d.ts`.
  - Server code expects Cloudflare bindings (D1, R2, Durable Objects). Update `wrangler.json` when adding bindings and re-run `npm run cf-typegen`.
  - Post-build step `scripts/append_do_export.js` appends Durable Object export metadata — keep changes in DO names in sync with this script.
  - Admin-only endpoints require `x-admin-key` header; authentication uses `Authorization: Bearer <token>` and HttpOnly cookies for refresh tokens.
  - Content collections: Markdown/MDX blog content lives under `src/content/blog/` and is consumed via `getCollection()`.

- **When you change runtime bindings or env names**:
  1. Update `wrangler.json` bindings.
  2. Run `npm run cf-typegen` to refresh types.
  3. Update `env.d.ts` if necessary.
  4. Run `npm test` to validate.

- **Where to look first when debugging**:
  - Local dev: `npm run dev` (Astro) — console shows serverless function errors.
  - Worker/Durable Object logic: [workers/GlobalChat.js](workers/GlobalChat.js)
  - Database issues: `migrations/` SQL and code that calls D1 in `src/pages/api/*`.

- **Git & PR Workflow**:
  - **Branching**: Create a new branch for changes using the format `feature/<feature-name>`.
  - **Pull Requests**: Automatically create a PR into `main` for these branches.
  - **PR Summary**: Include a summary of files changed and features added in the PR description/comments.

- **Current Focus & Todo**:
  - [ ] Improve test coverage for chat Durable Object (especially edge cases).
  - [ ] Improve test coverage for media upload and R2 interactions.
  - [ ] Add end-to-end tests for key user flows (auth, posting, chat).
  - [ ] Add a toolbar for editing blog posts and make a user friendly way to add markdown content.
  - [ ] 

References: README ([README.md](README.md)), test guide ([tests/README.md](tests/README.md)), `package.json` scripts ([package.json](package.json)).

If anything is unclear or you'd like more detail (examples of request/response shapes or typical test mocks), tell me which part to expand. 
