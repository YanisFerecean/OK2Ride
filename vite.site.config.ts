import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const page = (name: string): string => decodeURIComponent(new URL(`site/${name}`, import.meta.url).pathname);

const pkgVersion = (JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as { version: string }).version;

/**
 * Replaces `{{PKG_VERSION}}` in the pages with the version from package.json,
 * so the install snippet can never drift from what is actually published.
 */
function injectVersion(): Plugin {
  return {
    name: 'inject-pkg-version',
    transformIndexHtml: (html) => html.replaceAll('{{PKG_VERSION}}', pkgVersion),
  };
}

/**
 * Website build: landing page with the live widget plus the documentation.
 * Served with `npm run dev`, built into `dist-site/` with `npm run site:build`.
 * The relative `base` lets the output be hosted from any sub-path.
 */
export default defineConfig({
  root: 'site',
  base: './',
  publicDir: false,
  plugins: [injectVersion()],
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
