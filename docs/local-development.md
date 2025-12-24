# Local Development Guide

This project uses a multi-worker setup:
1.  **`family-blog`**: The main Astro application (frontend + API).
2.  **`family-blog-chat`**: A separate worker hosting the `GlobalChat` Durable Object and managing the database connection for chat.

## Running Locally

To run the full application locally with the chat feature enabled, you need to run both workers simultaneously.

### Prerequisites
- Ensure you have run `npm install`.
- Ensure you have run `npm run cf-typegen` to generate types.

### Step 1: Start the Chat Worker
Open a terminal and run:
```bash
npm run dev:chat
```
This starts the `family-blog-chat` worker on port `8787` (default). It hosts the Durable Object and the D1 database.

### Step 2: Start the Main Application
Open a **second** terminal and run:
```bash
npm run preview
```
This builds the Astro app and starts the `family-blog` worker using `wrangler dev`. It will likely start on port `8788` (since 8787 is taken).

### How it works
- The `family-blog` worker is configured in `wrangler.json` to bind the `GLOBAL_CHAT` Durable Object to the `family-blog-chat` worker (`script_name: "family-blog-chat"`).
- When running locally, Wrangler's local registry allows `family-blog` to discover and communicate with the locally running `family-blog-chat` worker.
- Both workers share the same local D1 database state because they are configured with the same `database_id` in their respective `wrangler.json` files.

### Troubleshooting
- **Port Conflicts**: If you see port errors, Wrangler usually auto-assigns the next available port. Look at the terminal output to see which URL to access (e.g., `http://localhost:8788`).
- **Database State**: Local database state is stored in `.wrangler/state/v3/d1`. Since both workers share the project root, they share this state.
