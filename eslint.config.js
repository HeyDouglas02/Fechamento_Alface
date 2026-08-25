import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),

  // Frontend (React, roda no navegador).
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Buscar dados no mount com useEffect + setState é o padrão deste
      // projeto. A regra pressupõe Suspense ou uma biblioteca de data
      // fetching (React Query e afins), que um sistema local de uma máquina
      // só não justifica.
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  // Backend e scripts (rodam no Node — precisam de process, Buffer, etc).
  {
    files: ['server/**/*.js', 'tests/**/*.mjs', '*.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: 'module',
    },
  },

  // Testes do frontend rodam no Node, apesar de viverem em src/.
  {
    files: ['src/**/*.test.js'],
    languageOptions: { globals: globals.node },
  },
])
