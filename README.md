# Family Blog - Private Social Site

A private friends and family social site built with Astro and deployed on Cloudflare Pages with Workers, D1, R2, and Durable Objects.

## Features

### Authentication & Security
- ✅ Password-based authentication with JWT tokens
- ✅ Refresh token rotation (30-day TTL)
- ✅ Admin-only account creation
- ✅ Secure HttpOnly cookies
- ✅ Bcrypt password hashing
- ✅ SHA-256 refresh token hashing

### Social Features
- ✅ Post creation with text and media
- ✅ Media upload to R2 storage
- ✅ Feed with pagination
- ✅ Real-time global chat (WebSocket via Durable Object)
- ✅ Markdown blog posts (preserved from original template)

### Technical Stack
- ✅ Astro for static site generation
- ✅ Cloudflare Pages Functions for API endpoints
- ✅ D1 for database (users, posts, media, refresh tokens)
- ✅ R2 for media storage
- ✅ Durable Objects for WebSocket chat
- ✅ Comprehensive test suite with Vitest

### Additional Features
- ✅ 100/100 Lighthouse performance
- ✅ SEO-friendly with canonical URLs and OpenGraph data
- ✅ Sitemap support
- ✅ RSS Feed support
- ✅ Built-in Observability logging

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/astro-blog-starter-template
```

A live public deployment of this template is available at [https://astro-blog-starter-template.templates.workers.dev](https://astro-blog-starter-template.templates.workers.dev)

## 🚀 Project Structure

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

The `src/content/` directory contains "collections" of related Markdown and MDX documents. Use `getCollection()` to retrieve posts from `src/content/blog/`, and type-check your frontmatter using an optional schema. See [Astro's Content Collections docs](https://docs.astro.build/en/guides/content-collections/) to learn more.

Any static assets, like images, can be placed in the `public/` directory.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Cloudflare account
- Wrangler CLI

### Local Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   # Automated setup (recommended)
   ./scripts/setup_env.sh
   
   # Or manually copy and edit the example files
   cp .env.example .env
   cp .dev.vars.example .dev.vars
   ```
   
   See [docs/LOCAL_DEVELOPMENT.md](./docs/LOCAL_DEVELOPMENT.md) for detailed setup instructions.

3. **Start development server**
   ```bash
   # Option 1: Astro dev (fast, but no Cloudflare bindings)
   npm run dev
   
   # Option 2: Wrangler preview (full Cloudflare environment)
   npm run preview
   ```

4. **Create admin user**
   ```bash
   npm run seed:admin
   ```

For complete local development guide, see [docs/LOCAL_DEVELOPMENT.md](./docs/LOCAL_DEVELOPMENT.md).

## 🧞 Commands

| Command                           | Action                                                |
| :-------------------------------- | :---------------------------------------------------- |
| `npm install`                     | Installs dependencies                                 |
| `npm run dev`                     | Starts local dev server at `localhost:4321`           |
| `npm run build`                   | Build your production site to `./dist/`               |
| `npm run preview`                 | Preview your build locally with Wrangler              |
| `npm test`                        | Run test suite                                        |
| `npm run test:watch`              | Run tests in watch mode                               |
| `npm run test:coverage`           | Run tests with coverage report                        |
| `npm run deploy`                  | Deploy your production site to Cloudflare             |
| `npm run astro ...`               | Run CLI commands like `astro add`, `astro check`      |
| `npm run cf-typegen`              | Generate TypeScript types from Cloudflare bindings    |
| `wrangler tail`                   | View real-time logs for all Workers                   |

## 📋 Deployment

**Important**: Before deploying, follow the comprehensive [Deployment Checklist](./docs/DEPLOYMENT_CHECKLIST.md).

### Quick Deployment Steps

1. **Create Cloudflare Resources**
   ```bash
   # Create D1 database
   wrangler d1 create family_blog_db
   
   # Create R2 bucket (via dashboard or CLI)
   # Update wrangler.json with correct database_id
   ```

2. **Set Environment Variables** (in Cloudflare Dashboard)
   - `JWT_SECRET` - Generate with: `openssl rand -base64 32`
   - `ADMIN_API_KEY` - Generate with: `openssl rand -base64 32`

3. **Run Migrations**
   ```bash
   wrangler d1 execute family_blog_db --remote --file=./migrations/001_init.sql
   ```

4. **Create Admin User** (via API after deployment)
   ```bash
   curl -X POST https://your-site.pages.dev/api/admin/users \
     -H "Content-Type: application/json" \
     -H "x-admin-key: YOUR_ADMIN_API_KEY" \
     -d '{"email": "admin@example.com", "password": "secure-password", "name": "Admin"}'
   ```

5. **Deploy**
   ```bash
   npm run deploy
   ```

For detailed instructions, see [docs/DEPLOYMENT_CHECKLIST.md](./docs/DEPLOYMENT_CHECKLIST.md).

## 📖 API Endpoints

### Authentication
- `POST /api/auth/login` - User login (returns JWT + refresh cookie)
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout and revoke refresh token

### Admin
- `POST /api/admin/users` - Create user (requires `x-admin-key` header)

### Posts
- `GET /api/posts` - List posts
- `POST /api/posts` - Create post (requires Bearer token)

### Feed
- `GET /api/feed?limit=50&cursor=0` - Get paginated feed

### Media
- `POST /api/media/upload` - Upload media to R2 (requires Bearer token)

### Chat
- `GET /api/chat/connect` - WebSocket connection for chat (upgrades to WS)

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

See [tests/README.md](./tests/README.md) for detailed testing documentation.

## 📁 Project Structure

```
family-blog/
├── src/                 # Astro source files
├── functions/           # Cloudflare Pages Functions (API)
├── workers/             # Cloudflare Workers (Durable Objects)
├── migrations/          # D1 database migrations
├── tests/               # Test suite
├── docs/                # Documentation
└── public/              # Static assets
```

## 📚 Documentation

- [Project Plan](./docs/plan.md) - Original project specifications
- [Code Review](./docs/REVIEW.md) - Issues found and fixed
- [Deployment Checklist](./docs/DEPLOYMENT_CHECKLIST.md) - Step-by-step guide
- [Testing Guide](./tests/README.md) - How to run tests
- [Project Summary](./docs/SUMMARY.md) - Complete overview

## 🔒 Security

- Passwords hashed with bcrypt (cost 10)
- Refresh tokens hashed with SHA-256
- JWT tokens with 15-minute expiration
- Refresh tokens with 30-day expiration and rotation
- Secure, HttpOnly, SameSite cookies
- Admin-only user creation

## 🛠 Tech Stack

- **Framework**: Astro 5.x
- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2
- **Real-time**: Cloudflare Durable Objects
- **Testing**: Vitest

## 🆘 Troubleshooting

See [docs/DEPLOYMENT_CHECKLIST.md](./docs/DEPLOYMENT_CHECKLIST.md) for common issues and solutions.

## Credit

This theme is based off of the lovely [Bear Blog](https://github.com/HermanMartinus/bearblog/).
