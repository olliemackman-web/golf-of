// Flat config using only ESLint's built-in rules, so `npm run lint` needs no plugins.
// The goal is to catch real breakage (undefined names, unused imports, unreachable code),
// not to enforce a style: the codebase deliberately packs several statements per line.
import globals from 'globals';

const common = {
  ecmaVersion: 2022,
  sourceType: 'module',
};

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
  'no-unreachable': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-const-assign': 'error',
  'no-redeclare': 'error',
  'no-self-assign': 'error',
  'no-unsafe-negation': 'error',
  'no-import-assign': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-debugger': 'error',
  'eqeqeq': ['warn', 'smart'],
};

export default [
  { ignores: ['vendor/**', 'node_modules/**'] },
  {
    files: ['src/**/*.js'],
    languageOptions: { ...common, globals: { ...globals.browser } },
    rules,
  },
  {
    files: ['tools/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ...common, globals: { ...globals.node } },
    rules,
  },
];
