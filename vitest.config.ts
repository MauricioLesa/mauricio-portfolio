import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@/': fromRoot('./src') + '/',
      // `server-only` throws outside a React Server Components bundle; stub it for unit tests.
      'server-only': fromRoot('./tests/unit/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'infra/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/server/**'],
    },
  },
});
