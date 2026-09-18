import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * El trinquete del contrato de interfaz mide lo que dice medir.
 *
 * Es un detector, y un detector sin test es una opinión. Este repo lleva dos
 * casos medidos de lo mismo: un censo que listaba unas líneas y no sus vecinas
 * iguales, y un gate que corría con menos tests y reportaba «passed».
 *
 * El 2026-09-06 el trinquete tuvo las dos formas del defecto, una detrás de
 * otra:
 *
 *  1. **Contaba prosa.** `#1129` escrito en un comentario de JSX es un hex de
 *     cuatro dígitos, así que citar el número de un issue rompía el build. Con
 *     cuatro números de issue fantasma ya contados como colores.
 *  2. **Y al arreglarlo, dejó de contar código.** Descartar la LÍNEA entera
 *     cuando empieza por la apertura de un comentario JSX ciega también lo que
 *     venga DETRÁS de su cierre en la misma línea — y un comentario corto
 *     seguido de una expresión con color es JSX corriente. Lo sondeó la
 *     revisión adversarial del mismo día.
 *
 * Este archivo corre el linter de verdad sobre un árbol de mentira, con las dos
 * clases de línea. No mira contadores: mira que vea lo que hay y no vea lo que
 * no hay.
 *
 * LOS CINCO CASOS VAN EN UN SOLO ÁRBOL Y UNA SOLA CORRIDA. Antes cada uno
 * armaba su repo temporal y arrancaba su `node`: cinco `git init`, cinco `git
 * add`, cinco procesos. Bajo carga eso son 3-6 s por arranque y el caso se come
 * su tope de 5 s sin haber medido nada — medido el 2026-09-18, este archivo se
 * cayó dos veces por «Test timed out» dentro del hook de `pre-push` mientras la
 * máquina tenía seis Chromium encima, y una tercera aquí mismo con la máquina
 * quieta (16,07 s de reloj, un caso en 2,7 s y otro pasándose). Con una sola
 * corrida son ~2 s y ninguno depende del reloj.
 *
 * Al compartir la salida, cada `it` afirma lo suyo POR ARCHIVO —«no aparece
 * `src/A.tsx`», no «el total es 0»—, que además es mejor oráculo: fija el
 * comportamiento del archivo en vez del contador global. Y el primero exige que
 * el censo no haya salido vacío, porque un detector ciego devuelve cero
 * hallazgos y eso se lee igual que «todo bien».
 */

const RAIZ = process.cwd();

/**
 * El entorno SIN las variables que git exporta dentro de un hook.
 *
 * `git push` corre esta suite desde `pre-push`, y ahí git pone `GIT_DIR`,
 * `GIT_INDEX_FILE` y compañía en el entorno: el `git init` / `git add` de abajo
 * las heredaba y trabajaba sobre el repo de AFUERA en vez del temporal, así que
 * el linter recibía el árbol equivocado y este test se caía dentro del hook —
 * solo dentro del hook. Medido el 2026-09-18 (#1143).
 */
const ENV_SIN_GIT = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
) as NodeJS.ProcessEnv;

const CASOS: Record<string, string> = {
  // El linter exige un archivo de tokens para no contarlo a él: su `#123456`
  // es el control de la exención y no puede aparecer en el censo.
  'src/styles/tokens.css': ':root { --accent: #123456; }\n',

  // El falso positivo que rompía el build al citar #1129.
  'src/A.tsx': [
    'export const A = () => (',
    '  <div>',
    '    {/* el arreglo de #1129, medido el 06-09 */}',
    '    <span />',
    '  </div>',
    ');',
  ].join('\n'),

  // El falso negativo que abría el arreglo del anterior. `{/* c */ expr}` es
  // JSX válido y corriente.
  'src/B.tsx': [
    'export const B = ({ activo }) => (',
    '  <div>',
    '    {/* nota */ activo && <span style={{ color: \'#ff0000\' }} />}',
    '  </div>',
    ');',
  ].join('\n'),

  // El control positivo: si esto fallara, los negativos pasarían por ceguera
  // total y no por acierto.
  'src/C.tsx': "export const c = '#abcdef';\n",

  // Un color citado dentro de un bloque de comentario de varias líneas.
  'src/D.tsx': [
    '/**',
    ' * antes era #ff0000 y se cambió por un token',
    ' */',
    'export const d = 1;',
  ].join('\n'),

  // `t.startsWith('*')` descartaba la línea por parecer JSDoc. `* { … }` es un
  // selector, no prosa.
  'src/E.css': '* { color: #beef00; }\n',
};

/** Corre el linter con `--list R3` sobre el árbol de mentira, una sola vez. */
function censoR3(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vina-trinquete-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir, env: ENV_SIN_GIT });
    for (const [ruta, contenido] of Object.entries(CASOS)) {
      const destino = join(dir, ruta);
      mkdirSync(join(destino, '..'), { recursive: true });
      writeFileSync(destino, contenido);
    }
    execFileSync('git', ['add', '-A'], { cwd: dir, env: ENV_SIN_GIT });
    return execFileSync(
      'node',
      [join(RAIZ, 'scripts', 'ui-contract-lint.mjs'), '--root', dir, '--list', 'R3'],
      // Sin las GIT_* el `git ls-files` del linter lee el árbol de mentira y no
      // el de afuera; con ellas puestas —dentro del hook— leía el repo entero.
      { cwd: dir, encoding: 'utf8', env: ENV_SIN_GIT },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** El sitio que el censo imprime para un archivo: `  ruta:línea  color`. */
const sitio = (archivo: string, color: string) =>
  new RegExp(`${archivo.replace('.', '\\.')}:\\d+\\s+${color}`);

describe('el trinquete de UI no está ciego', () => {
  let salida = '';
  beforeAll(() => { salida = censoR3(); });

  it('el censo no sale vacío, ni cuenta el archivo de tokens', () => {
    // Sin esto, los tres «no aparece» de abajo pasarían por ceguera total.
    expect(salida, 'el censo no encontró nada: el detector está ciego').toMatch(/R3 .* 3 sitios/);
    expect(salida, 'contó el archivo de tokens, que es donde SÍ es legal un literal')
      .not.toContain('tokens.css');
  });

  it('NO cuenta el número de un issue escrito en un comentario de JSX', () => {
    expect(salida, 'cuenta prosa: un número de issue no es un color').not.toContain('src/A.tsx');
  });

  it('pero SÍ cuenta un color escrito detrás de un comentario de JSX cerrado', () => {
    expect(salida, 'un color detrás de un comentario cerrado queda invisible')
      .toMatch(sitio('src/B.tsx', '#ff0000'));
  });

  it('y sigue viendo un color en una línea normal', () => {
    expect(salida).toMatch(sitio('src/C.tsx', '#abcdef'));
  });

  it('y NO ve un color dentro de un bloque de comentario de varias líneas', () => {
    expect(salida, 'un color citado en prosa de JSDoc no es una decisión de color')
      .not.toContain('src/D.tsx');
  });

  it('pero un selector universal de CSS con color SÍ se cuenta, aunque empiece por `*`', () => {
    expect(salida, 'el selector universal ciega la línea entera')
      .toMatch(sitio('src/E.css', '#beef00'));
  });
});
