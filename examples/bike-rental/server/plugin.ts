import type { Plugin } from 'vite';
import { createApiMiddleware } from './http.ts';
import { RentalStore } from './store.ts';

/** Mounts the rental API on Vite's dev and preview servers. */
export function rentalApi(store: RentalStore = new RentalStore()): Plugin {
  const middleware = createApiMiddleware(store);
  return {
    name: 'ok2ride-bike-rental-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
