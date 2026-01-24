import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:email': path.resolve(__dirname, './tests/mocks/cloudflare_email.js')
    }
  },
  test: {
    globals: true,
    setupFiles: ['./tests/vitest.setup.ts'],
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
