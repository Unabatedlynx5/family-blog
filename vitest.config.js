import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // Main aliases
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: 'astro:content', replacement: path.resolve(__dirname, './tests/mocks/astro-content.js') },
      // Resolve workers/utils imports (match any number of ../)
      { find: /^(\.\.\/)+workers\/utils\/rate-limit$/, replacement: path.resolve(__dirname, './workers/utils/rate-limit.ts') },
      { find: /^(\.\.\/)+workers\/utils\/validation$/, replacement: path.resolve(__dirname, './workers/utils/validation.ts') },
      { find: /^(\.\.\/)+workers\/utils\/auth$/, replacement: path.resolve(__dirname, './workers/utils/auth.ts') },
      { find: /^(\.\.\/)+workers\/utils\/security-headers$/, replacement: path.resolve(__dirname, './workers/utils/security-headers.ts') },
      { find: /^(\.\.\/)+workers\/utils\/csrf$/, replacement: path.resolve(__dirname, './workers/utils/csrf.ts') },
      // Resolve types/cloudflare imports (match any number of ../)
      { find: /^(\.\.\/)+types\/cloudflare$/, replacement: path.resolve(__dirname, './src/types/cloudflare.ts') }
    ]
  },
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '*.config.js',
        '*.config.ts',
        '.astro/',
        'public/',
        'scripts/'
      ]
    },
    testTimeout: 10000,
    hookTimeout: 10000
  }
});
