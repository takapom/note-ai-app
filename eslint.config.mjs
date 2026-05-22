import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'docs/generated/**',
      'apps/workspace-api/generated/**',
      '**/.next/**',
      '**/.next-*/**',
    ],
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'contexts/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'import-x': importX,
    },
    rules: {
      'max-lines': ['error', {
        max: 499,
        skipBlankLines: false,
        skipComments: false,
      }],
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
      }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'import-x/no-cycle': ['warn', { maxDepth: 1 }],
    },
  },
  {
    files: ['contexts/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/apps/**'],
            message: 'contexts/* must not import apps/*; apps consume context contracts and do not own product semantics.',
          },
          {
            group: ['**/docs/generated/**', '**/apps/workspace-api/generated/**'],
            message: 'generated artifacts are projections only and must not be imported as product policy.',
          },
        ],
      }],
    },
  },
  {
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/docs/generated/**', '**/apps/workspace-api/generated/**'],
            message: 'generated artifacts are projections only and must not be imported as product policy.',
          },
        ],
      }],
    },
  },
);
