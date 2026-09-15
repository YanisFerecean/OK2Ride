import { defineConfig } from 'vitest/config';

/**
 * Library build: compiles the `<ok2ride-check>` custom element into a
 * single self-registering ES module at `dist/ok2ride.js`.
 * Type declarations are emitted separately by `tsc -p tsconfig.build.json`.
 */
export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'ok2ride.js',
    },
    rollupOptions: {
      output: {
        exports: 'named',
      },
    },
  },
  resolve: {
    // Lets tests import the package the way integrators do (used by examples/).
    alias: [
      { find: /^ok2ride\/token$/, replacement: decodeURIComponent(new URL('./src/token.ts', import.meta.url).pathname) },
      { find: /^ok2ride$/, replacement: decodeURIComponent(new URL('./src/index.ts', import.meta.url).pathname) },
    ],
  },
  test: {
    include: ['src/**/*.test.ts', 'examples/**/*.test.ts'],
    environment: 'node',
  },
});
