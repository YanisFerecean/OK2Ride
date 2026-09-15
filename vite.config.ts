import { defineConfig } from 'vitest/config';

/**
 * Library build: compiles the `<cognitive-captcha>` custom element into a
 * single self-registering ES module at `dist/cognitive-captcha.js`.
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
      fileName: () => 'cognitive-captcha.js',
    },
    rollupOptions: {
      output: {
        exports: 'named',
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
