import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Trinquete de la conversión entre espacio de patrón y espacio de pieza.
 *
 * Sustituye al que vivía en `herramientas.piezaGirada.test.ts`, que decía
 * cubrir 24 sitios y tenía tres puntos ciegos (#1069):
 *
 *  1. **Solo miraba la resta.** Su regex empezaba en `-`, así que cubría
 *     patrón → local y nada más. La dirección contraria —`local + position`,
 *     sin girar— es la de #1068, y no veía ninguno de sus sitios.
 *  2. **No era recursivo.** `readdirSync` sobre `components/PatternEditor/`
 *     no entraba a `renderers/` ni a `renderers/overlays/`, ni alcanzaba
 *     `utils/`, donde vive el helper que protege.
 *  3. **Se rodeaba con una variable.** `const ox = snap.position.x` seguida
 *     de `anchor.x - ox` es exactamente la resta cruda que prohibía, y el
 *     regex no la veía porque el nombre no contenía "piece". Ese era el sitio
 *     del bug de #1066.
 *
 * Este mira las DOS direcciones, recorre `src/` entero y trata el alias como
 * infracción propia — capturar la posición en una variable no tiene ningún uso
 * legítimo, solo esconde la aritmética de la línea siguiente.
 *
 * Es un TRINQUETE, no una prohibición: los 74 sitios de hoy son deuda
 * declarada (#1068), no código aprobado. Falla si un archivo sube su cuenta,
 * si aparece un archivo nuevo, o si uno baja y nadie fijó el techo nuevo.
 */

const RAIZ = 'src';

/** Receptores que NO son piezas: su `position` ya vive en el espacio correcto. */
const NO_PIEZA = /^(node|img|cam|camera|scene|artwork|selectedNodeData|penDistance|action|target|existing|obj|mesh|light|group)$/;

const LECTURA = /([A-Za-z_$][\w$]*)\.position\.([xy])/;
/** `const ox = piece.position.x` — el rodeo del regex viejo. */
const ALIAS = /(?:const|let|var)\s+[\w$]+\s*=\s*[A-Za-z_$][\w$]*\.position\.[xy]\s*;?\s*$/;
/** La posición sumada o restada a otra coordenada, en cualquier orden. */
const ARITMETICA = /[+-]\s*[A-Za-z_$][\w$]*\.position\.[xy]|[A-Za-z_$][\w$]*\.position\.[xy]\s*[+-]/;

/** Los únicos con derecho a tocar la posición a mano: son la conversión. */
const HELPERS = new Set([
  'src/utils/geometry/pieceSpace.ts',
  'src/components/PatternEditor/pieceTransform.ts',
]);

/**
 * Techo por archivo. Bajarlo es el trabajo de #1068; subirlo, un bug nuevo.
 * Cuando un archivo llegue a 0, quítalo de aquí — el trinquete lo exige.
 */
const TECHO: Record<string, number> = {
  'src/components/PatternEditor/renderers/TrimRenderer.tsx': 5,
  'src/components/PatternEditor/renderers/overlays/POMOverlay.tsx': 8,
  'src/components/PatternEditor/renderers/overlays/WalkSeamOverlay.tsx': 2,
  'src/components/PatternEditor/sewingUtils.ts': 4,
  'src/components/PatternEditor/useEditorInteractions.ts': 3,
  'src/components/PatternEditor/useExtendTrimTool.ts': 3,
  'src/components/PatternEditor/useMeasureTool.ts': 5,
  'src/components/PatternEditor/useMergeTool.ts': 2,
  'src/components/PatternEditor/usePOMMeasureTool.ts': 2,
  'src/components/PatternEditor/useScissorsTool.ts': 1,
  'src/components/PatternEditor/useSlashAndSpreadTool.ts': 1,
  'src/components/PatternEditor/useTransformTool.ts': 1,
  'src/components/PatternEditor/useTrimTool.ts': 2,
  'src/copilot/action/tools/definitions/patternOpsTools.ts': 3,
  'src/store/editorSlice.ts': 2,
  'src/utils/grading/gradeAllSizes.ts': 1,
  'src/utils/patternOps.ts': 7,
  'src/utils/pom/pomCompute.ts': 2,
};

function* archivos(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') yield* archivos(p);
      continue;
    }
    if (/\.tsx?$/.test(e.name)) yield p;
  }
}

/** ¿Esta línea convierte a mano entre los dos espacios? */
export function infringe(linea: string): boolean {
  const m = linea.match(LECTURA);
  if (!m || NO_PIEZA.test(m[1])) return false;
  return ALIAS.test(linea) || ARITMETICA.test(linea);
}

function censo(): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const f of archivos(RAIZ)) {
    const rel = relative('.', f).split(sep).join('/');
    if (HELPERS.has(rel)) continue;
    const n = readFileSync(f, 'utf8').split('\n').filter(infringe).length;
    if (n) cuenta[rel] = n;
  }
  return cuenta;
}

describe('trinquete: la conversión patrón ↔ local pasa por el helper', () => {
  const hoy = censo();

  it('ningún archivo sube su cuenta ni aparece uno nuevo', () => {
    const subidas = Object.entries(hoy)
      .filter(([f, n]) => n > (TECHO[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} (techo ${TECHO[f] ?? 0}) — usa pieceLocalToPattern / patternToPieceLocal`);
    expect(subidas).toEqual([]);
  });

  it('los techos que bajaron están fijados', () => {
    // Si arreglas un sitio, el techo tiene que bajar con él. Sin esto, el
    // margen ganado queda disponible para el próximo que lo rompa.
    const flojos = Object.entries(TECHO)
      .filter(([f, techo]) => (hoy[f] ?? 0) < techo)
      .map(([f, techo]) => `${f}: quedan ${hoy[f] ?? 0}, el techo dice ${techo} — bájalo (o quítalo si es 0)`);
    expect(flojos).toEqual([]);
  });
});

describe('el trinquete trinca — los tres puntos ciegos que tenía el viejo', () => {
  it('ve la SUMA, no solo la resta', () => {
    expect(infringe('  const sx = start.x + piece.position.x;')).toBe(true);
    expect(infringe('  const lx = pt.x - piece.position.x;')).toBe(true);
  });

  it('ve el ALIAS, aunque la aritmética esté en otra línea', () => {
    // El sitio exacto de #1066, que el regex viejo no veía.
    expect(infringe('        const ox = snap.position.x;')).toBe(true);
  });

  it('recorre subdirectorios, no solo el primer nivel', () => {
    const vistos = Object.keys(censo());
    expect(vistos.some(f => f.includes('/renderers/overlays/'))).toBe(true);
    expect(vistos.some(f => f.startsWith('src/utils/'))).toBe(true);
    expect(vistos.some(f => f.startsWith('src/store/'))).toBe(true);
  });

  it('deja en paz lo que no es una pieza', () => {
    expect(infringe('  const dx = local.x - node.position.x;')).toBe(false);
    expect(infringe('  cam.position.x + 10;')).toBe(false);
  });

  it('no marca el transform del renderizador, que no hace aritmética', () => {
    expect(infringe('  transform={`translate(${piece.position.x}, ${piece.position.y})`}')).toBe(false);
  });
});
