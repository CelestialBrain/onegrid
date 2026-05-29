// Solid's package.json ships separate `server` and `browser` conditions —
// without an explicit `conditions` array vitest resolves the SSR build,
// where `createRoot` is a no-op. Force the development browser build so
// reactivity actually fires under jsdom.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['development', 'browser'],
  },
  test: {
    environment: 'jsdom',
  },
});
