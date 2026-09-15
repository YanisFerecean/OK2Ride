import { defineConfig } from 'vite';
import { rentalApi } from './examples/bike-rental/server/plugin.ts';

const here = (path: string): string => decodeURIComponent(new URL(path, import.meta.url).pathname);

/**
 * OK2Ride Bikes, the example rental app. `npm run rent` serves it with the
 * rental API on http://localhost:5174; `npm run rent:build` then
 * `npm run rent:preview` serves the production build with the same API.
 * `ok2ride` resolves to the widget source so the app code reads like a
 * real integration.
 */
export default defineConfig({
  root: 'examples/bike-rental',
  base: './',
  publicDir: false,
  plugins: [rentalApi()],
  resolve: {
    alias: [
      { find: /^ok2ride\/token$/, replacement: here('./src/token.ts') },
      { find: /^ok2ride$/, replacement: here('./src/index.ts') },
    ],
  },
  build: {
    outDir: here('./dist-rent'),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [here('.')] },
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
});
