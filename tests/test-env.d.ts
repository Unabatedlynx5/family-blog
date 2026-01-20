/// <reference types="vite/client" />
/// <reference types="@cloudflare/workers-types" />

import type { Miniflare } from 'miniflare';

declare global {
  var miniflare: Miniflare;
  var testEnv: {
    DB: D1Database;
    JWT_SECRET: string;
    ADMIN_API_KEY: string;
    GLOBAL_CHAT: Fetcher;
    POST_ROOM: Fetcher;
    MEDIA: R2Bucket;
    [key: string]: any;
  };
}

export {};
