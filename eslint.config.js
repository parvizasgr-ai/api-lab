// ESLint (flat config) — TypeScript üçün tövsiyə olunan qaydalar.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // web-design/ — ayrıca UI layihəsi (öz tsconfig/build-i var), import/ — xam Figma Make export-u
  { ignores: ['node_modules', 'data', 'web/dist', 'web-design', 'import', 'dist', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // OpenAPI sənədi və DB sətirləri dinamik JSON-dur — bəzi yerlərdə `any` şüurlu seçimdir.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
