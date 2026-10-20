#!/usr/bin/env node
/**
 * medir-bordes-lint — nadie vuelve a medir un borde sin traducir su rango.
 *
 * Por qué existe: `SemanticEdge.segmentRange` viene en la convención del
 * PRODUCTOR, donde el tramo de cierre —el que la `Z` dibuja de vuelta al punto
 * de la `M`— se rotula con el índice de la `M`, que no dibuja nada. Quien lo
 * mida sin traducirlo obtiene CERO: en un rectángulo, un lado entero de la
 * pieza. El defecto se arregló cuatro veces entre 2026-09-06 y 2026-09-18, y
 * las tres primeras solo tocaron los sitios que alguien miraba ese día. Esto
 * es lo que hace que la quinta no exista.
 *
 * Dos reglas, una por cada forma medida del defecto:
 *
 *   R1 — medir en espacio de COMANDOS sin traducir. Dos formas: un
 *        `segmentRange` metido directo en los argumentos de la familia de
 *        `arcLength`, y —más flojo— un archivo que lee `segmentRange`, mide, y
 *        no nombra a NADIE que traduzca. Lo que la segunda no ve, dicho: un
 *        archivo que ya traduce en un sitio podría medir crudo en otro con el
 *        rango desestructurado en variables. Se acepta el hueco: la forma que
 *        se copia y se pega es la primera.
 *
 *   R2 — confundir COMANDOS con PUNTOS: un archivo que lee `segmentRange` y
 *        aplana el contorno a puntos tiene que convertir con
 *        `commandRangeToFlattened` (o usar la procedencia `.cmd` de cada
 *        punto). El comando `i` dibuja del punto `i-1` al `i`, así que indexar
 *        los puntos con índices de comando corre un borde: medido el
 *        2026-09-18, el hilo del BOM y los avíos se cobraban con el largo del
 *        lado de al lado en TODOS los bordes, no solo en el de cierre, y
 *        «Medir» enganchaba el borde vecino al que se clicaba.
 *
 * No es un trinquete con techo: el repo está a cero y el gate falla con uno.
 *
 * Uso:
 *   node scripts/medir-bordes-lint.mjs             # verifica
 *   node scripts/medir-bordes-lint.mjs --list      # lista los sitios
 *   node scripts/medir-bordes-lint.mjs --root DIR  # mide OTRO repo (para probarlo)
 *
 * `--root` existe porque un detector sin test es una opinión:
 * `tests/repo/el-trinquete-de-medir-bordes-no-esta-ciego.test.ts`.
 *
 * Issue: #1143. Contrato del productor: `outlineAnalysis.ts` («COMMAND space»).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_PROPIA = join(dirname(fileURLToPath(import.meta.url)), '..');
const iRoot = process.argv.indexOf('--root');
const ROOT = iRoot !== -1 && process.argv[iRoot + 1] ? process.argv[iRoot + 1] : RAIZ_PROPIA;
const LISTAR = process.argv.includes('--list');

const FAMILIA_QUE_MIDE = 'computePathArcLength|pointAtPathDistance|samplePathAtIntervals|distanceAlongPath|projectOntoPath|samplePathDense';

/** Una llamada a la familia que mide a lo largo de un rango de comandos. */
const MIDEN = new RegExp(`\\b(${FAMILIA_QUE_MIDE})\\s*\\(`);
/**
 * La misma llamada con un `segmentRange` metido en los argumentos SIN pasar
 * por el traductor. El patrón es «templado»: avanza carácter a carácter hasta
 * el `segmentRange` pero se rinde si por el camino aparece
 * `rangoMedibleDeBorde`, que es exactamente la forma correcta de escribirlo
 * dentro de la llamada.
 */
const MIDE_CRUDO = new RegExp(
  `\\b(${FAMILIA_QUE_MIDE})\\s*\\((?:(?!rangoMedibleDeBorde)[^;]){0,400}?segmentRange`,
);
/** Aplanar el contorno a un array de puntos. */
const APLANAN = /\b(flattenPath|flattenPathToPoints|flattenPathWithSource)\s*\(/;

const LEE_RANGO = /\bsegmentRange\b/;
/** Traducir, o delegar en alguien que traduce. */
const TRADUCE = /\b(rangoMedibleDeBorde|computeRangeLengthMM|interpolateRangePoint|computeEdgeLengthMM|interpolateEdgePoint)\b/;
/** Cruzar de comandos a puntos como se debe: por conversión o por procedencia. */
const CONVIERTE = /\bcommandRangeToFlattened\b|\.cmd\b/;

/** Los dueños del convenio: aquí es donde se definen la traducción y la conversión. */
const PROPIETARIOS = ['src/utils/semanticEdges.ts', 'src/utils/seam/index.ts'];

const esTest = (f) => /__tests__|\.test\.|\.spec\./.test(f);

/**
 * El entorno SIN las variables que git exporta dentro de un hook.
 *
 * Dentro de `pre-push`, git pone `GIT_DIR`, `GIT_INDEX_FILE` y compañía en el
 * entorno, y un `git ls-files` que las herede consulta ESE índice en vez del
 * árbol que se le pide por `cwd`. El trinquete medía otra cosa y tumbaba el
 * push sin que el repo tuviera nada malo. Medido el 2026-09-18.
 */
const ENV_SIN_GIT = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
);

function archivos() {
  const out = execFileSync('git', ['ls-files', '*.ts', '*.tsx'], {
    cwd: ROOT, encoding: 'utf8', env: ENV_SIN_GIT,
  });
  return out.split('\n')
    .filter(Boolean)
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => f.startsWith('src/') && !esTest(f) && !PROPIETARIOS.includes(f));
}

/** Líneas que no son comentario puro, para no contar prosa. */
function codigo(texto) {
  return texto.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
}

const fallos = [];
for (const f of archivos()) {
  const fuente = codigo(readFileSync(join(ROOT, f), 'utf8'));
  if (!LEE_RANGO.test(fuente)) continue;

  if (MIDE_CRUDO.test(fuente)) {
    fallos.push({ regla: 'R1', archivo: f, que: 'pasa un `segmentRange` crudo a la familia que mide' });
  } else if (MIDEN.test(fuente) && !TRADUCE.test(fuente)) {
    fallos.push({ regla: 'R1', archivo: f, que: 'mide un rango de comandos y no nombra a nadie que traduzca' });
  }

  if (APLANAN.test(fuente) && !CONVIERTE.test(fuente)) {
    fallos.push({ regla: 'R2', archivo: f, que: 'mezcla índices de comando con un array de puntos, sin commandRangeToFlattened' });
  }
}

if (LISTAR || fallos.length > 0) {
  for (const f of fallos) console.log(`${f.regla} ${f.archivo} — ${f.que}`);
}

if (fallos.length === 0) {
  console.log('\n  ✓ nadie mide un borde sin traducir su rango.\n');
  process.exit(0);
}

console.log(`\n  ✗ ${fallos.length} sitio(s) miden un borde con el rango crudo (#1143).`);
console.log('    El tramo de cierre se rotula con el índice de la `M`, que no dibuja:');
console.log('    sin traducir mide CERO, y en un rectángulo eso es un lado entero.');
console.log('    Arreglo: `rangoMedibleDeBorde(outline, edge.segmentRange)` al LEER,');
console.log('    o delegar en `computeRangeLengthMM` / `interpolateRangePoint`.\n');
process.exit(1);
