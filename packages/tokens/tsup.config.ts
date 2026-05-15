import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/themes/light.ts',
    'src/themes/dark.ts',
    'src/density/compact.ts',
    'src/density/comfortable.ts',
    'src/density/spacious.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  splitting: false,
});
