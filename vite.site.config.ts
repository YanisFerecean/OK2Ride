import { defineConfig } from 'vite';

const page = (name: string): string => decodeURIComponent(new URL(`site/${name}`, import.meta.url).pathname);

/**
 * Website build: landing page with the live widget plus the documentation.
 * Served with `npm run dev`, built into `dist-site/` with `npm run site:build`.
 * The relative `base` lets the output be hosted from any sub-path.
 */
export default defineConfig({
  root: 'site',
  base: './',
  publicDir: false,
  build: {
    outDir: '../dist-site',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        index: page('index.html'),
        docs: page('docs.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: ['..'] },
  },
});
