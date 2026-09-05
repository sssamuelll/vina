/**
 * Deuda declarada de #1068 — la conversión a mano entre espacio de patrón y
 * espacio local de pieza.
 *
 * ESTA ES LA ÚNICA LISTA. La consumen dos sitios y no puede divergir:
 *
 *  - `eslint.config.js` apaga `vina/conversion-espacio-de-pieza` en estos
 *    archivos. Sin eso, `lint-staged` corre `eslint --max-warnings=0` sobre lo
 *    staged y tocar `patternOps.ts` por cualquier motivo bloquearía el commit
 *    con sus 9 avisos heredados. El gate castigaría al que pasa por al lado.
 *  - `src/utils/geometry/__tests__/pieceSpace.trinquete.test.ts` los usa como
 *    TECHO: el archivo no puede subir su cuenta, y si baja hay que fijar el
 *    número nuevo.
 *
 * Resultado de la combinación: un archivo limpio que regresa falla en el
 * commit y sale subrayado en el editor; un archivo con deuda que crece falla
 * en el push. Ninguno de los dos caminos queda abierto.
 *
 * Esto NO es código aprobado. Es deuda con nombre. Cuando un archivo llegue a
 * 0, bórralo de aquí — el trinquete lo exige, y borrarlo es lo que devuelve la
 * regla al archivo.
 *
 * ── Sobre la unidad de medida ──────────────────────────────────────────────
 * Estos números cuentan EXPRESIONES, no líneas. El trinquete de regex que
 * había antes contaba líneas, y por eso decía 57 donde esto dice 71: una línea
 * como
 *
 *     const px = v[0] + piece.position.x, py = v[1] + piece.position.y;
 *
 * son dos conversiones independientes, cada una arreglable por separado. No es
 * deuda que creció — al portar la regla a AST se midieron las dos unidades
 * sobre el mismo árbol: 71 expresiones repartidas en exactamente las mismas 57
 * líneas y los mismos 21 archivos que veía el regex. La deuda es la misma; la
 * lupa es mejor.
 *
 * Cross-ref: #1068, `eslint-rules/rules/conversion-espacio-de-pieza.js`.
 */

/** @type {Record<string, number>} */
export const TECHOS = {
  'src/components/PatternEditor/PatternEditor.tsx': 4,
  'src/components/PatternEditor/renderers/ElasticRenderer.tsx': 1,
  'src/components/PatternEditor/renderers/SeamRenderer.tsx': 2,
  'src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx': 2,
  'src/components/PatternEditor/renderers/overlays/TopstitchOverlay.tsx': 2,
  'src/components/PatternEditor/useEditorInteractions.ts': 6,
  'src/components/PatternEditor/usePOMMeasureTool.ts': 2,
  'src/components/PatternEditor/useTopstitchTool.ts': 6,
  'src/components/PatternEditor/useTransformTool.ts': 2,
  'src/copilot/action/tools/definitions/patternOpsTools.ts': 1,
  'src/hooks/useElasticTool.ts': 4,
  'src/store/editorSlice.ts': 4,
  'src/store/projectSlice.ts': 5,
  'src/utils/grading/gradeAllSizes.ts': 1,
  'src/utils/patternOps.ts': 5,
  'src/utils/pom/pomCompute.ts': 2,
};

/** Los archivos con deuda, como globs para el bloque de override de ESLint. */
export const ARCHIVOS_CON_DEUDA = Object.keys(TECHOS);
