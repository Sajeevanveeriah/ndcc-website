// ESLint 9 flat config. Same rule set as the former .eslintrc.json
// (next/core-web-vitals + next/typescript via eslint-config-next's legacy
// configs through FlatCompat) and the same scope `next lint` used: its
// default directories app/, components/ and lib/ (pages/ and src/ do not
// exist here). Everything else stays unlinted, as before.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  {
    ignores: [
      '**/*',
      '!app/',
      '!app/**',
      '!components/',
      '!components/**',
      '!lib/',
      '!lib/**',
      '!pages/',
      '!pages/**',
      '!src/',
      '!src/**',
      // `next build` resolves the config for this file to detect the Next.js
      // plugin; keeping it un-ignored avoids a false "plugin not detected" warning.
      '!eslint.config.mjs',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // ESLint 9 started warning on unused disable directives by default;
    // ESLint 8 (and `next lint`) did not. Keep the previous behaviour.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
];

export default eslintConfig;
