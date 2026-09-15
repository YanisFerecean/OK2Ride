import { defineConfig } from 'vite';

/**
 * Server-safe entry: only the verification-token helpers, with no DOM
 * dependency, so backends can `import { decodeVerificationToken } from
 * 'ok2ride/token'`. Built after the main bundle into the same
 * `dist/` directory.
 */
export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    minify: true,
    lib: {
      entry: 'src/token.ts',
      formats: ['es'],
      fileName: () => 'token.js',
    },
  },
});
