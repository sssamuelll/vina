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
 * **Y tenía tres rodeos más**, encontrados el 2026-08-24 por una revisión
 * adversarial de los lotes 1-3 de #1068, ya cerrados aquí:
 *
 *  4. **Propiedad anidada a la DERECHA del operador.** `m.point.x +
 *     edge.piece.position.x` no casaba, porque la primera rama de `ARITMETICA`
 *     exigía el `+` pegado al identificador y ahí lo que sigue al `+` es
 *     `edge`. A la izquierda sí lo veía: era asimétrico.
 *  5. **Encadenamiento opcional.** `piece.position?.x` no casa `\.position\.`.
 *     Es la forma MÁS común del alias en este repo — 20 de los 32 sitios que
 *     aparecieron al cerrarlo.
 *  6. **Alias del objeto entero.** `const pos = piece.position;` y la
 *     aritmética en la línea siguiente, que ni siquiera contiene "position".
 *
 * Cerrarlos destapó 32 sitios que ningún censo anterior había contado, así que
 * el "74" que decía esta prosa era un subconteo. Hoy son 64.
 *
 * Es un TRINQUETE, no una prohibición: esos 64 son deuda declarada (#1068), no
 * código aprobado. Falla si un archivo sube su cuenta, si aparece un archivo
 * nuevo, o si uno baja y nadie fijó el techo nuevo.
 */

const RAIZ = 'src';

/**
 * Receptores que NO son piezas: su `position` ya vive en el espacio correcto.
 * `current` es el `.current` de un ref de Three.js (`groupRef.current.position`)
 * y `attributes` el de un BufferGeometry (`geo.attributes.position`) — ninguno
 * de los dos es una pieza de patrón.
 */
const NO_PIEZA = /^(node|img|cam|camera|scene|artwork|selectedNodeData|penDistance|action|target|existing|obj|mesh|light|group|current|attributes)$/;

/**
 * La coordenada, con las dos formas que rodeaban al regex anterior: el
 * receptor puede venir ENCADENADO (`edge.piece.position.x`) y el acceso puede
 * ser OPCIONAL (`piece.position?.x`). Captura el último identificador antes de
 * `.position`, que es el que `NO_PIEZA` juzga.
 */
const COORD = String.raw`(?:[A-Za-z_$][\w$]*\??\.)*([A-Za-z_$][\w$]*)\??\.position\??\.[xy]`;

const LECTURA = new RegExp(COORD);
/** `const ox = piece.position.x` / `= piece.position?.x ?? 0` — alias de coordenada. */
const ALIAS_COORD = new RegExp(String.raw`(?:const|let|var)\s+[\w$]+\s*=\s*${COORD}[^+\-]*$`);
/** `const pos = edge.piece.position;` — se lleva el objeto entero y la aritmética se esconde en la línea siguiente. */
const ALIAS_OBJETO = new RegExp(String.raw`(?:const|let|var)\s+[\w$]+\s*=\s*(?:[A-Za-z_$][\w$]*\??\.)*([A-Za-z_$][\w$]*)\??\.position\s*;?\s*$`);
/** La posición sumada o restada a otra coordenada, en cualquier orden. */
const ARITMETICA = new RegExp(String.raw`[+-]\s*${COORD}|${COORD}\s*[+-]`);

/**
 * Vía de escape para el código que SÍ tiene derecho a componer la posición a
 * mano: el `transform=` de un renderizador es `translate(position) rotate(...)`
 * por definición, y envolverlo en el helper lo rompería. Va en la línea de
 * ARRIBA porque los sitios reales son plantillas JSX donde no cabe un comentario
 * de línea. Es deliberadamente incómoda: exige nombrar la razón.
 */
const EXENTA = /\/\/\s*espacio-de-patrón:/;

/**
 * Los únicos con derecho a tocar la posición a mano: son la conversión.
 *
 * `transform.ts` está aquí porque es la capa primitiva sobre la que
 * `pieceSpace.ts` se apoya —`rotatePoint` y `outlineBBoxCenter` viven ahí— y
 * su `piecePoints(piece, rotated)` aplica el giro él mismo, ofreciendo la
 * variante sin girar a propósito. No es un consumidor con deuda.
 */
const HELPERS = new Set([
  'src/utils/geometry/pieceSpace.ts',
  'src/utils/geometry/transform.ts',
  'src/components/PatternEditor/pieceTransform.ts',
]);

/**
 * Techo por archivo. Bajarlo es el trabajo de #1068; subirlo, un bug nuevo.
 * Cuando un archivo llegue a 0, quítalo de aquí — el trinquete lo exige.
 */
const TECHO: Record<string, number> = {
  // Los 11 archivos de abajo NO son deuda nueva: son deuda que el regex
  // anterior nunca vio. Aparecieron el 2026-08-24 al cerrar sus tres rodeos.
  'src/components/PatternEditor/PatternEditor.tsx': 4,
  'src/components/PatternEditor/renderers/ElasticRenderer.tsx': 1,
  'src/components/PatternEditor/renderers/SeamRenderer.tsx': 2,
  'src/components/PatternEditor/renderers/overlays/SeamAllowanceSelectionOverlay.tsx': 2,
  'src/components/PatternEditor/renderers/overlays/SlashAndSpreadOverlay.tsx': 2,
  'src/components/PatternEditor/renderers/overlays/TopstitchOverlay.tsx': 2,
  'src/components/PatternEditor/useLineTool.ts': 2,
  'src/components/PatternEditor/useTopstitchTool.ts': 6,
  'src/components/PatternEditor/useWalkSeamTool.ts': 2,
  'src/hooks/useElasticTool.ts': 4,

  'src/components/PatternEditor/renderers/overlays/WalkSeamOverlay.tsx': 7,
  'src/components/PatternEditor/useEditorInteractions.ts': 3,
  'src/components/PatternEditor/useExtendTrimTool.ts': 3,
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

/**
 * ¿Esta línea convierte a mano entre los dos espacios? `anterior` es la línea
 * de arriba, y solo se mira para honrar la marca de exención.
 */
export function infringe(linea: string, anterior = ''): boolean {
  if (EXENTA.test(anterior)) return false;
  const obj = linea.match(ALIAS_OBJETO);
  if (obj) return !NO_PIEZA.test(obj[1]);
  const m = linea.match(LECTURA);
  if (!m || NO_PIEZA.test(m[1])) return false;
  return ALIAS_COORD.test(linea) || ARITMETICA.test(linea);
}

function censo(): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const f of archivos(RAIZ)) {
    const rel = relative('.', f).split(sep).join('/');
    if (HELPERS.has(rel)) continue;
    const lineas = readFileSync(f, 'utf8').split('\n');
    const n = lineas.filter((l, i) => infringe(l, i > 0 ? lineas[i - 1] : '')).length;
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

describe('el trinquete trinca — los seis puntos ciegos que llegó a tener', () => {
  it('ve la SUMA, no solo la resta', () => {
    expect(infringe('  const sx = start.x + piece.position.x;')).toBe(true);
    expect(infringe('  const lx = pt.x - piece.position.x;')).toBe(true);
  });

  it('ve el ALIAS, aunque la aritmética esté en otra línea', () => {
    // El sitio exacto de #1066, que el regex viejo no veía.
    expect(infringe('        const ox = snap.position.x;')).toBe(true);
  });

  it('ve la propiedad ANIDADA, a los dos lados del operador', () => {
    // El rodeo era asimétrico: a la izquierda del `+` sí lo veía.
    expect(infringe('        const wx = m.point.x + edge.piece.position.x;')).toBe(true);
    expect(infringe('        const wx = edge.piece.position.x + m.point.x;')).toBe(true);
    expect(infringe('          x: pt.x + edge.piece.position.x,')).toBe(true);
  });

  it('ve el encadenamiento OPCIONAL', () => {
    // 20 de los 32 sitios que aparecieron el 2026-08-24 tienen esta forma.
    expect(infringe('  const ox = piece.position?.x ?? 0;')).toBe(true);
    expect(infringe('  const oy = piece?.position?.y ?? 0;')).toBe(true);
    expect(infringe('  const lx = pt.x - piece.position?.x;')).toBe(true);
  });

  it('ve el alias del OBJETO entero, no solo el de la coordenada', () => {
    // La línea que usa `pos.x` ni siquiera contiene "position".
    expect(infringe('  const pos = stationaryEdge.piece.position;')).toBe(true);
    expect(infringe('  const offA = pieceA.position;')).toBe(true);
    // Pero un ref de Three.js o un BufferAttribute no son piezas.
    expect(infringe('  const p = groupRef.current.position;')).toBe(false);
    expect(infringe('  const positions = geo.attributes.position;')).toBe(false);
  });

  it('honra la exención cuando la línea de arriba la nombra', () => {
    const linea = '  const t = `translate(${piece.position.x + tx}, ${piece.position.y + ty}) rotate(0,0,0)`;';
    expect(infringe(linea)).toBe(true);
    expect(infringe(linea, '  // espacio-de-patrón: transform del renderizador.')).toBe(false);
    // Un comentario cualquiera NO exime: hay que nombrar la marca.
    expect(infringe(linea, '  // esto está bien, confía en mí')).toBe(true);
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
