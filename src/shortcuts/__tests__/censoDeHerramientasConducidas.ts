/**
 * El censo, por TEXTO, de qué herramientas 2D sabe conducir el despachador.
 *
 * Vive aquí, en un solo sitio, porque estaba copiado en dos y se desincronizó
 * exactamente como avisa `toolActivation.ts` que pasa con las listas: el #1172
 * mudó `MEASURE_TOOL_IDS` fuera del despachador, se le enseñó a UN detector a
 * seguirlo, y el otro se quedó ciego — verde en el archivo que se tocó, rojo
 * en el que no. **Dos copias de un censo son dos censos.**
 *
 * Lo leen `atajos-solo-de-herramientas-con-gesto.test.ts` (¿toda tecla tiene
 * gesto detrás?) y `herramienta-con-gesto-tiene-puerta.test.ts` (¿todo gesto
 * tiene puerta visible?). Son las dos mitades de la ley de puertas y las dos
 * necesitan la misma respuesta a «¿qué conduce el despachador?».
 *
 * Dos formas cuentan, y las dos salen del mismo `if`:
 *   1. `activeTool === 'x'` — la mayoría.
 *   2. `X_TOOL_IDS = new Set([...])` + `.has(activeTool)` — medir y compañía.
 *      El conjunto puede declararse en el despachador o en `toolActivation.ts`,
 *      pero solo cuenta si el DESPACHADOR lo consulta: una lista suelta en el
 *      store no conduce nada.
 *
 * NO cuenta el `switch` de cursor (`case 'x': return 'default'`): pintar un
 * cursor no es conducir un gesto. Ese fue el ciego que dejó pasar a
 * `topstitchEdit` en la primera lectura de la revisión del 2026-09-04.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');

export const DESPACHADOR = leer('src/components/PatternEditor/useEditorInteractions.ts');

/** Dónde puede estar declarado un `X_TOOL_IDS` que el despachador consulte. */
const DECLARAN_CONJUNTOS = [DESPACHADOR, leer('src/store/toolActivation.ts')];

export function idsQueElDespachadorConduce(): Set<string> {
  const ids = new Set<string>();
  for (const m of DESPACHADOR.matchAll(/activeTool\s*===\s*'([A-Za-z0-9]+)'/g)) ids.add(m[1]);
  for (const fuente of DECLARAN_CONJUNTOS) {
    for (const decl of fuente.matchAll(/const\s+([A-Z0-9_]*TOOL_IDS)\s*=\s*new Set\(\[([^\]]*)\]/g)) {
      // Solo si ese Set se consulta con el id activo; si no, es lista muerta.
      if (!DESPACHADOR.includes(`${decl[1]}.has(activeTool`)) continue;
      for (const lit of decl[2].matchAll(/'([A-Za-z0-9]+)'/g)) ids.add(lit[1]);
    }
  }
  return ids;
}
