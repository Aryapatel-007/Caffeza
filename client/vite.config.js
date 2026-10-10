import { fileURLToPath } from 'node:url';
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { secondLanguageFonts } from './fontSubset.js';

const CLIENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CLIENT_DIR, '..');

const DEFAULT_SERVER_PORT = 5000;
const DEFAULT_CLIENT_PORT = 5173;

/**
 * The port in an origin, or the default when the origin is missing or not a
 * URL. A host that builds the client usually has no .env at build time, and
 * `new URL('')` throws, which used to fail the whole production build.
 */
function portFromOrigin(origin, fallback) {
  try {
    return Number(new URL(origin).port) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * The dev server reads the same .env the API reads, so the port the client
 * proxies to and the origin the API allows cannot drift apart.
 *
 * Nothing from here is exposed to the browser. This file runs in Node, and
 * Vite only ships variables prefixed with VITE_ to the bundle. There are none.
 */
/**
 * Reads the root .env without letting it decide what kind of build this is.
 *
 * `loadEnv` has a side effect: when a file it reads sets NODE_ENV, it copies
 * the value into `process.env.VITE_USER_NODE_ENV`, and Vite then makes the
 * whole build a development build. The root .env says NODE_ENV=development on
 * every developer machine, because the server reads it, so every `vite build`
 * from a developer machine, the Vercel deploys included, shipped React's
 * development build: twice the JavaScript, and slower (P30, P32). This reads
 * the file and puts that variable back as it was.
 */
function readRootEnv(mode) {
  const before = process.env.VITE_USER_NODE_ENV;
  const env = loadEnv(mode, REPO_ROOT, '');
  if (before === undefined) delete process.env.VITE_USER_NODE_ENV;
  else process.env.VITE_USER_NODE_ENV = before;
  return env;
}

/**
 * Fails a production build that contains React's development code. P32: the
 * fix above is the reason it cannot happen, and this is how we would know if
 * it ever came back. `validateDOMNesting` exists only in react-dom's
 * development build.
 */
function refuseDevelopmentReact() {
  return {
    name: 'refuse-development-react',
    apply: (_config, { command, mode }) => command === 'build' && mode !== 'development',
    generateBundle(_options, bundle) {
      const found = Object.values(bundle).find((output) => output.type === 'chunk' && output.code.includes('validateDOMNesting'));
      if (found) this.error(`${found.fileName} holds React's development build. A production build must not; is NODE_ENV=development leaking in?`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = readRootEnv(mode);

  const apiPort = Number(env.PORT) || DEFAULT_SERVER_PORT;
  const clientPort = portFromOrigin(env.CLIENT_ORIGIN, DEFAULT_CLIENT_PORT);

  return {
    plugins: [secondLanguageFonts({ clientDir: CLIENT_DIR }), react(), tailwindcss(), refuseDevelopmentReact()],
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
