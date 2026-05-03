// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/*.config.{ts,js,mjs,cjs}',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      // Numbers / bigints / booleans in template literals are fine — we
      // intentionally use them in error messages and metrics summaries.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowAny: false, allowNullish: false },
      ],
      // Arrow shorthand returning void is idiomatic React; we don't enforce.
      '@typescript-eslint/no-confusing-void-expression': 'off',
      // We assert/cast in narrowly scoped places (e.g. clipboard nullable type).
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // value ?? '' is a deliberate safe-coerce in renderers.
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
  // Tests can be lighter on style — they routinely stub APIs and assert.
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
