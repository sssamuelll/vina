import { describe, it, expect } from 'vitest';
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
 *     revisión adversarial del mismo día; el caso vive abajo, en el segundo
 *     test, que es donde se puede escribir sin romper este bloque.
 *
 * Este archivo corre el linter de verdad sobre un árbol de mentira, con las dos
 * clases de línea. No mira contadores: mira que vea lo que hay y no vea lo que
 * no hay.
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

/** Corre el linter con `--list R3` sobre un repo de mentira y devuelve su salida. */
function censoR3(archivos: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'vina-trinquete-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir, env: ENV_SIN_GIT });
    mkdirSync(join(dir, 'src', 'styles'), { recursive: true });
    // El linter exige un archivo de tokens para no contarlo a él.
    writeFileSync(join(dir, 'src', 'styles', 'tokens.css'), ':root { --accent: #123456; }\n');
    for (const [ruta, contenido] of Object.entries(archivos)) {
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

describe('el trinquete de UI no está ciego', () => {
  it('NO cuenta el número de un issue escrito en un comentario de JSX', () => {
    // El falso positivo que rompía el build al citar #1129.
    const salida = censoR3({
      'src/A.tsx': [
        'export const A = () => (',
        '  <div>',
        '    {/* el arreglo de #1129, medido el 06-09 */}',
        '    <span />',
        '  </div>',
        ');',
      ].join('\n'),
    });
    expect(salida, 'cuenta prosa: un número de issue no es un color').toContain('0 sitios');
  });

  it('pero SÍ cuenta un color escrito detrás de un comentario de JSX cerrado', () => {
    // El falso negativo que abría el arreglo del anterior. `{/* c */ expr}` es
    // JSX válido y corriente.
    const salida = censoR3({
      'src/B.tsx': [
        'export const B = ({ activo }) => (',
        '  <div>',
        '    {/* nota */ activo && <span style={{ color: \'#ff0000\' }} />}',
        '  </div>',
        ');',
      ].join('\n'),
    });
    expect(salida, 'un color detrás de un comentario cerrado queda invisible').toContain('#ff0000');
  });

  it('y sigue viendo un color en una línea normal', () => {
    // El control positivo: si esto fallara, los dos de arriba pasarían por
    // ceguera total y no por acierto.
    const salida = censoR3({ 'src/C.tsx': "export const c = '#abcdef';\n" });
    expect(salida).toContain('#abcdef');
  });

  it('y NO ve un color dentro de un bloque de comentario de varias líneas', () => {
    const salida = censoR3({
      'src/D.tsx': [
        '/**',
        ' * antes era #ff0000 y se cambió por un token',
        ' */',
        'export const d = 1;',
      ].join('\n'),
    });
    expect(salida).toContain('0 sitios');
  });

  it('pero un selector universal de CSS con color SÍ se cuenta, aunque empiece por `*`', () => {
    // `t.startsWith('*')` descartaba la línea por parecer JSDoc. `* { … }` es un
    // selector, no prosa.
    const salida = censoR3({ 'src/E.css': '* { color: #beef00; }\n' });
    expect(salida, 'el selector universal ciega la línea entera').toContain('#beef00');
  });
});
