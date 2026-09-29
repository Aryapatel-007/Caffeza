import { fileURLToPath } from 'node:url';
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const CLIENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CLIENT_DIR, '..');

const DEFAULT_SERVER_PORT = 5000;
const DEFAULT_CLIENT_PORT = 5173;

/**
 * The dev server reads the same .env the API reads, so the port the client
 * proxies to and the origin the API allows cannot drift apart.
 *
 * Nothing from here is exposed to the browser. This file runs in Node, and
 * Vite only ships variables prefixed with VITE_ to the bundle. There are none.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, REPO_ROOT, '');

  const apiPort = Number(env.PORT) || DEFAULT_SERVER_PORT;
  const clientPort = Number(new URL(env.CLIENT_ORIGIN ?? '').port) || DEFAULT_CLIENT_PORT;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: clientPort,
      // Fail rather than silently moving to another port. If the client moves,
      // CORS on the API stops matching and the failure looks like a bug in the
      // code rather than a port collision.
      strictPort: true,
      proxy: {
        // Same-origin requests in development, so there is one less difference
        // between what we test and what we deploy.
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
