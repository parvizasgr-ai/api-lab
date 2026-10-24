// ESLint (flat config) — TypeScript üçün tövsiyə olunan qaydalar.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // import/ — xam Figma Make export-u (toxunulmur); web-design build/test nəticələri
  { ignores: ['**/node_modules', 'artifacts', 'data', 'web/dist', 'import', 'dist', 'coverage', 'web-design/dist', 'web-design/test-results', 'web-design/playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Portal (React) — brauzer mühiti
  {
    files: ['web-design/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  // Server və testlər: DB qatı asinxrondur — gözlənilməmiş (await-siz) Promise yarış vəziyyəti yaradır, ona görə xətadır
  {
    files: ['server/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false } }],
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // OpenAPI sənədi və DB sətirləri dinamik JSON-dur — bəzi yerlərdə `any` şüurlu seçimdir.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
