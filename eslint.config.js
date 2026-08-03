import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import vinaPlugin from './eslint-rules/index.js'

export default tseslint.config(
  // Nada de esto es fuente del repo, y todo aparece SOLO en local: CI arranca de
  // un checkout limpio y nunca lo ve. Sin estas entradas `npm run lint` da un
  // resultado distinto según quién lo corra y qué haya corrido antes — y un gate
  // que depende de eso deja de ser un gate. Medido sobre esta misma máquina:
  //
  //   .worktrees/       5 errores + 116 avisos  (copias de trabajo de git;
  //                     `git ls-files` da 0 archivos ahí)
  //   coverage/         6 avisos  (HTML que genera el propio gate de cobertura,
  //                     así que correr los gates en orden ensuciaba el siguiente)
  //   crates/*/pkg/     2 avisos  (salida de wasm-pack; se auto-ignora en git con
  //                     un .gitignore propio, pero eslint sí entraba)
  //
  // Fuente real: 0 errores, 56 avisos.
  { ignores: ['dist', 'coverage', '.worktrees/**', 'crates/*/pkg/**', 'eslint-rules/tests/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'vina': vinaPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'vina/require-use-disposable': 'warn',
    },
  },
)
