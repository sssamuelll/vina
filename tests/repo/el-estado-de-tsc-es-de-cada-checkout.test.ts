import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El estado de `tsc -b` vive en cada checkout, no en el node_modules compartido.
 *
 * `tsc -b` guarda en el `tsBuildInfoFile` de cada proyecto la lista de archivos
 * que comprobó. Si esa lista coincide y ninguna entrada es más nueva que el
 * archivo, da el proyecto por «al día» y no comprueba nada. Los worktrees
 * enlazan el node_modules del checkout principal, así que un estado guardado en
 * `node_modules/.tmp` lo escribe cualquier checkout para todos: un typecheck de
 * otra sesión deja en blanco el de este, el del pre-commit y el del deploy.
 * Medido el 2026-10-10: el estado que había lo acababa de escribir otro
 * worktree, y nombraba un archivo que en este checkout no existe.
 *
 * Con la memoria del gate pesa más: un typecheck saltado se guardaba como
 * pasado para todo el árbol. Por eso vive en `.tmp/` de cada checkout, que
 * está en .gitignore.
 */
const RAIZ = process.cwd();
const TSCONFIGS = ['tsconfig.app.json', 'tsconfig.node.json', 'bench/tsconfig.json'];

function estados(): Array<{ tsconfig: string; ruta: string }> {
  return TSCONFIGS.flatMap((tsconfig) => {
    const m = readFileSync(join(RAIZ, tsconfig), 'utf8').match(/"tsBuildInfoFile"\s*:\s*"([^"]+)"/);
    return m ? [{ tsconfig, ruta: m[1] }] : [];
  });
}

describe('el estado de tsc -b es de cada checkout', () => {
  it('el censo no está ciego: los tres proyectos declaran dónde guardan su estado', () => {
    expect(estados().map((e) => e.tsconfig)).toEqual(TSCONFIGS);
  });

  it('ninguno lo guarda en node_modules, que los worktrees comparten', () => {
    expect(estados().filter((e) => e.ruta.includes('node_modules'))).toEqual([]);
  });

  it('y lo guardan en .tmp/, que git ignora', () => {
    expect(readFileSync(join(RAIZ, '.gitignore'), 'utf8')).toMatch(/^\.tmp\/$/m);
    for (const { ruta } of estados()) expect(ruta).toMatch(/^\.\.?\/\.tmp\//);
  });
});
