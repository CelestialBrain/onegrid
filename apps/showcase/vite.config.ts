import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  build: {
    sourcemap: true,
    rollupOptions: {
      // `@onegrid/export` has an optional peer dep on SheetJS (`xlsx`) for
      // its non-clean-room fallback path. The showcase only ever uses the
      // clean-room `@onegrid/xlsx` writer, so we keep SheetJS out of the
      // bundle. If a tab ever hits the SheetJS path it will throw at
      // runtime — that's a louder failure than silently shipping 430KB
      // of dead code.
      external: ['xlsx'],
      output: {
        // Provide a no-op resolution so the dynamic import doesn't blow
        // up at module-graph time.
        globals: { xlsx: 'undefined' },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm', 'xlsx'],
  },
});
