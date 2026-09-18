import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * El trinquete de medir bordes ve lo que hay y no ve lo que no hay.
 *
 * Es un detector, y un detector sin test es una opinión: arreglarle un falso
 * positivo le abre un falso negativo, y en este repo eso ya pasó —el trinquete
 * de UI tuvo las dos formas del defecto el mismo día—. Así que van los dos
 * casos y sus controles.
 *
 * Lo que vigila: medir un `segmentRange` sin traducirlo. El tramo de cierre de
 * toda pieza se rotula con el índice de la `M`, que no dibuja, así que medirlo
 * crudo da cero — un lado entero de un rectángulo. Ver #1143.
 *
 * El control de `bueno.ts` es el que casi lo deja inservible: escribir la
 * traducción DENTRO de la llamada es correcto, y el patrón ingenuo lo marcaba
 * igual porque `segmentRange` sigue apareciendo entre los paréntesis.
 *
 * Los seis archivos van en UN repo de mentira y UNA corrida: el trinquete lista
 * todo lo que ve de una vez, y así este archivo no mete seis arranques de
 * `node` dentro de la suite. Con uno por caso, la carga extra empujaba a media
 * docena de tests asíncronos ajenos por encima de su tiempo límite.
 */

const RAIZ = process.cwd();

/**
 * El entorno SIN las variables que git exporta dentro de un hook.
 *
 * `git push` corre este test desde `pre-push`, y ahí git pone `GIT_DIR`,
 * `GIT_INDEX_FILE` y compañía en el entorno. Un `git init` / `git add` que las
 * herede trabaja sobre el repo de AFUERA en vez de sobre el temporal que se
 * acaba de crear, así que el detector medía otra cosa y tumbaba el push sin que
 * el repo tuviera nada malo. Medido el 2026-09-18.
 */
const ENV_SIN_GIT = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
) as NodeJS.ProcessEnv;


const CASOS: Record<string, string> = {
  // R1, forma directa: el rango metido en los argumentos de la llamada.
  'src/malo.ts': `
    import { computePathArcLength } from './geometry/arcLength';
    export function largo(piece, edge) {
      return computePathArcLength(piece.outline, edge.segmentRange[0], edge.segmentRange[1]);
    }
  `,
  // R1, forma desestructurada: el rango pasa por variables.
  'src/malo2.ts': `
    import { pointAtPathDistance } from './geometry/arcLength';
    export function punto(piece, edge, d) {
      const [desde, hasta] = edge.segmentRange;
      return pointAtPathDistance(piece.outline, d, desde, hasta);
    }
  `,
  // R2: indexar un array de PUNTOS con índices de COMANDO.
  'src/malo3.ts': `
    import { flattenPath } from './seam/index';
    export function largo(piece, edge) {
      const pts = flattenPath(piece.outline);
      const [start, end] = edge.segmentRange;
      let len = 0;
      for (let i = start; i < end; i++) len += Math.hypot(pts[i + 1].x - pts[i].x, 0);
      return len;
    }
  `,
  // CONTROL: la traducción escrita dentro de la propia llamada.
  'src/bueno.ts': `
    import { computePathArcLength } from './geometry/arcLength';
    import { rangoMedibleDeBorde } from './semanticEdges';
    export function largo(piece, edge) {
      return computePathArcLength(
        piece.outline,
        ...rangoMedibleDeBorde(piece.outline, edge.segmentRange),
      );
    }
  `,
  // CONTROL: delegar en las funciones que ya traducen.
  'src/bueno2.ts': `
    import { computeRangeLengthMM } from './geometry/edgeInterpolation';
    import { samplePathAtIntervals } from './geometry/arcLength';
    export function largo(piece, edge) {
      samplePathAtIntervals(piece.outline, 0.5);
      const r = edge.segmentRange;
      return computeRangeLengthMM(piece.outline, r);
    }
  `,
  // CONTROL: cruzar de comandos a puntos por la procedencia del punto.
  'src/bueno3.ts': `
    import { flattenPathWithSource } from './seam/index';
    export function puntos(piece, edge) {
      const [start, end] = edge.segmentRange;
      return flattenPathWithSource(piece.outline).filter(p => p.cmd >= start && p.cmd < end);
    }
  `,
  // CONTROL: `segmentRange` nombrado solo en prosa.
  'src/comentado.ts': `
    import { computePathArcLength } from './geometry/arcLength';
    // Ojo: esto NO usa el segmentRange del borde, mide el contorno entero.
    export function perimetro(piece) {
      return computePathArcLength(piece.outline);
    }
  `,
};

/** Corre el trinquete una vez sobre un repo de mentira con los siete casos. */
function censoDeLosCasos(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vina-medir-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir, env: ENV_SIN_GIT });
    for (const [ruta, contenido] of Object.entries(CASOS)) {
      const destino = join(dir, ruta);
      mkdirSync(join(destino, '..'), { recursive: true });
      writeFileSync(destino, contenido);
    }
    execFileSync('git', ['add', '-A'], { cwd: dir, env: ENV_SIN_GIT });
    try {
      return execFileSync(
        'node',
        [join(RAIZ, 'scripts', 'medir-bordes-lint.mjs'), '--root', dir, '--list'],
        { cwd: dir, encoding: 'utf8', env: ENV_SIN_GIT },
      );
    } catch (e) {
      // Sale con 1 cuando encuentra algo: la lista viene en stdout igual.
      return String((e as { stdout?: string }).stdout ?? '');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('el trinquete de medir bordes no está ciego', () => {
  let salida = '';
  beforeAll(() => { salida = censoDeLosCasos(); });

  it('ve el rango crudo metido en la llamada que mide', () => {
    expect(salida).toContain('R1 src/malo.ts');
  });

  it('ve el rango desestructurado en variables, que la forma directa no pilla', () => {
    expect(salida).toContain('R1 src/malo2.ts');
  });

  it('ve indexar un array de PUNTOS con índices de comando', () => {
    expect(salida).toContain('R2 src/malo3.ts');
  });

  it('CONTROL: no marca la traducción escrita DENTRO de la llamada', () => {
    expect(salida).not.toContain('src/bueno.ts');
  });

  it('CONTROL: no marca a quien delega en las funciones que ya traducen', () => {
    expect(salida).not.toContain('src/bueno2.ts');
  });

  it('CONTROL: no marca a quien cruza por la procedencia del punto', () => {
    expect(salida).not.toContain('src/bueno3.ts');
  });

  it('CONTROL: no cuenta prosa — `segmentRange` nombrado en un comentario', () => {
    expect(salida).not.toContain('src/comentado.ts');
  });

  it('y el repo de verdad está a cero', () => {
    // El trinquete corre aquí dentro, no en un script suelto que haya que
    // acordarse de invocar: `npm run test` es una de las cuatro puertas del
    // gate de despliegue, así que un sitio nuevo que mida crudo se cae solo.
    let listado = '';
    let codigo = 0;
    try {
      listado = execFileSync('node', [join(RAIZ, 'scripts', 'medir-bordes-lint.mjs')], {
        cwd: RAIZ, encoding: 'utf8', env: ENV_SIN_GIT,
      });
    } catch (e) {
      const err = e as { stdout?: string; status?: number };
      listado = String(err.stdout ?? '');
      codigo = err.status ?? 1;
    }
    expect(codigo, `el trinquete encontró sitios que miden sin traducir:\n${listado}`).toBe(0);
  });
});
