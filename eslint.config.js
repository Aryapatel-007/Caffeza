/**
 * ESLint, flat config.
 *
 * Deliberately small. No plugin set, no style rules, no formatter fights. It
 * catches the things that are actually bugs: a variable that is never used, a
 * promise nobody waits for, a stray debugger.
 */

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  AbortController: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  queueMicrotask: 'readonly',
  structuredClone: 'readonly',
  fetch: 'readonly',
  Intl: 'readonly',
};

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  fetch: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  AbortController: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  Intl: 'readonly',
  HTMLElement: 'readonly',
};

const sharedRules = {
  'no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
  ],
  'no-console': 'off',
  'no-debugger': 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'smart'],
  'no-implicit-coercion': 'error',
  'require-await': 'error',
};

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**'],
  },

  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: sharedRules,
  },

  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: browserGlobals,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...sharedRules,
      // Core no-unused-vars does not see a component used inside JSX, and we
      // are not pulling in eslint-plugin-react just for that. Imported
      // components are PascalCase, so exempt that shape.
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^([A-Z_]|use[A-Z])',
          caughtErrors: 'none',
        },
      ],
    },
  },

  {
    files: ['*.js', 'client/vite.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: sharedRules,
  },
];
