import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/cli.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  minify: false,
  splitting: false,
  shims: false,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
