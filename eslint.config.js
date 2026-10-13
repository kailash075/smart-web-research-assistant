// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['.output/**', '.wxt/**', 'coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  ...layerBoundaries(),
  {
    // Playwright reads fixture dependencies from the first parameter's destructuring
    // pattern, so a fixture without dependencies must be written as `({}, use) =>`.
    files: ['tests/e2e/**'],
    rules: { 'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }] },
  },
  {
    // Config files run in Node and are not part of the type-checked app.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);

// Keeps dependencies pointing inwards: shared <- domain <- schemas <- application
// <- infrastructure/composition <- ui/entrypoints. See README "Architecture".
function layerBoundaries() {
  const frameworks = ['wxt', 'wxt/**', 'react', 'react/**', 'react-dom', 'react-dom/**'];
  const layer = (/** @type {string} */ name) => `**/${name}/**`;
  const restrict = (/** @type {string[]} */ files, /** @type {string[]} */ forbidden) => ({
    files,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: forbidden, message: 'This import crosses an architecture boundary.' },
          ],
        },
      ],
    },
  });
  const outerLayers = ['ui', 'entrypoints', 'composition', 'infrastructure'].map(layer);

  return [
    restrict(
      ['src/shared/**'],
      [...frameworks, 'zod', ...['domain', 'schemas', 'application'].map(layer), ...outerLayers],
    ),
    restrict(
      ['src/domain/**'],
      [...frameworks, 'zod', ...['schemas', 'application'].map(layer), ...outerLayers],
    ),
    restrict(['src/schemas/**'], [...frameworks, layer('application'), ...outerLayers]),
    restrict(['src/application/**'], [...frameworks, ...outerLayers]),
    restrict(['src/ui/**', 'src/entrypoints/**'], [layer('infrastructure')]),
    {
      files: ['src/ui/**', 'src/entrypoints/**'],
      rules: {
        'no-restricted-properties': [
          'error',
          {
            object: 'browser',
            property: 'storage',
            message: 'Use the repository from useAppServices().',
          },
          {
            object: 'chrome',
            property: 'storage',
            message: 'Use the repository from useAppServices().',
          },
        ],
      },
    },
  ];
}
