import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

// ESLint flat config. Cobertura pragmática para una baseline usable en un codebase
// que nunca tuvo lint: las reglas más ruidosas arrancan en 'warn' (no rompen lint ni CI)
// y se pueden subir a 'error' a medida que se limpia.
export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'public', 'src/test/**'],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Baseline permisivo — subir a 'error' tras limpiar:
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Desactiva reglas de formato que conflicten con Prettier (debe ir último).
  prettier,
)
