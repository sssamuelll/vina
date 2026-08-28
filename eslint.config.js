import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import vinaPlugin from './eslint-rules/index.js'
import { ARCHIVOS_CON_DEUDA } from './eslint-rules/deuda-espacio-de-pieza.js'

export default tseslint.config(
  // Nada de esto es fuente del repo, y todo aparece SOLO en local: CI arranca de
  // un checkout limpio y nunca lo ve. Sin estas entradas `npm run lint` da un
  // resultado distinto según quién lo corra y qué haya corrido antes — y un gate
  // que depende de eso deja de ser un gate. Medido sobre esta misma máquina:
  //
  //   .worktrees/       5 errores + 116 avisos  (copias de trabajo de git;
  //                     `git ls-files` da 0 archivos ahí)
  //   .claude/worktrees/  206 avisos  (la MISMA clase de copia de trabajo, en
  //                     otra ruta; se le escapaba al patrón de arriba y no se
  //                     notó hasta que la regla de #1068 empezó a contar allí.
  //                     `git ls-files` también da 0)
  //   coverage/         6 avisos  (HTML que genera el propio gate de cobertura,
  //                     así que correr los gates en orden ensuciaba el siguiente)
  //   crates/*/pkg/     2 avisos  (salida de wasm-pack; se auto-ignora en git con
  //                     un .gitignore propio, pero eslint sí entraba)
  //
  // Fuente real: 0 errores, 57 avisos (17 react-hooks/exhaustive-deps, 14
  // react-refresh/only-export-components, 26 sin regla). El número decía 56
  // desde una medición vieja; se re-midió al añadir la línea de arriba. La
  // regla de #1068 aporta 0 a esta cuenta: su deuda vive en el trinquete.
  { ignores: ['dist', 'coverage', '.worktrees/**', '.claude/worktrees/**', 'crates/*/pkg/**', 'eslint-rules/tests/**'] },
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
      'vina/conversion-espacio-de-pieza': 'warn',
    },
  },
  {
    // La deuda declarada de #1068. `lint-staged` corre `eslint
    // --max-warnings=0` sobre lo staged, así que sin este bloque tocar
    // `patternOps.ts` por cualquier motivo bloquearía el commit con sus 9
    // avisos heredados — el gate castigaría al que pasa por al lado en vez de
    // al que introduce la conversión.
    //
    // Estos archivos no quedan sin vigilancia: el trinquete de
    // `pieceSpace.trinquete.test.ts` cuenta sus sitios con esta MISMA regla y
    // falla en el push si alguno sube. La lista sale de un solo módulo para
    // que las dos mitades no puedan divergir.
    files: ARCHIVOS_CON_DEUDA,
    rules: { 'vina/conversion-espacio-de-pieza': 'off' },
  },
  {
    // Los tests calculan la coordenada esperada A MANO, y tiene que ser así:
    // un test que arma su expectativa con el mismo helper que está probando no
    // prueba nada. El caso más claro es
    // `1064-hit-testing-con-pieza-girada.test.tsx:108`, donde la variable se
    // llama `sinGirar` — es el control deliberadamente sin rotar, la respuesta
    // equivocada a propósito. El censo del trinquete siempre saltó
    // `__tests__/`; esto alinea el lint con esa decisión en vez de dejar 16
    // avisos que nadie debe arreglar.
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}', 'tests/**'],
    rules: { 'vina/conversion-espacio-de-pieza': 'off' },
  },
)
