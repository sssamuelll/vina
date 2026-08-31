// @vitest-environment jsdom
/**
 * #1092 — el borde de cierre, el que María llamó "el punto cero".
 *
 *   [01:55] "no me arrastra toda la línea, se ha quedado fijo el de arriba y
 *   se mueve el de abajo… [04:06] siempre es esta línea."   (Editar patrón)
 *   [08:09] "esta línea se comporta siempre rara y distinta a las demás."
 *                                                         (Convertir en curva)
 *
 * Ella nombró la misma línea desde dos herramientas y acertó el diagnóstico.
 *
 * El repo YA tiene una convención para ese tramo: se etiqueta con el índice
 * del comando `Z`, que es el que lo dibuja. La siguen `outlineRing`
 * (`buildRing`, case 'Z'), `EditPatternOverlay`, `getEdgeEndpoints`
 * (`utils/geometry/path.ts`, con ramas 'Z' para los dos extremos) y
 * `splitSegmentAt` (case 'Z': inserta una `L` ANTES del `Z`). No se cambia la
 * convención: se completa donde falta.
 *
 * Los verbos que exigían `cmd.type === 'L'` salían mudos con el `Z`:
 * `convertToCurve` y `convertSegmentToSpline`. Curvar el cierre no es
 * convertir un comando — es INSERTAR uno antes del `Z`, como hace
 * `splitSegmentAt`. Y la curva insertada termina exactamente en el ancla del
 * `M`, así que `coincidentAnchorGroups` las agrupa y mover ese punto mueve
 * las dos (el mismo caso del vértice duplicado de CLO).
 *
 * El fixture es el rectángulo REAL (`useRectangleTool.create`): `M L L L Z`.
 */
import { describe, it, expect } from 'vitest';
import {
  nearestSegment, convertToCurve, convertToLine, splitSegmentAt,
  applyNodeMove, coincidentAnchorGroups, extractNodes,
} from '../nodeEditorUtils';
import { convertSegmentToSpline } from '../splineSegment';
import { getEdgeEndpoints } from '../../../utils/geometry/path';
import type { PathCommand, PatternPiece } from '../../../types/types';

/** El rectángulo real: cierra con `Z`. Cuatro anclas, cuatro bordes. */
const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];
const Z = 4;

/** Un contorno ABIERTO: aquí el cierre es un fantasma que no se dibuja. */
const ABIERTO: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
];

const pieza = (outline: PathCommand[]): PatternPiece => ({
  id: 'p', name: 'p', outline, internals: [],
  position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
  seamAllowance: 0, createdAt: 1, updatedAt: 1, active: true,
} as PatternPiece);

const anclas = (cmds: PathCommand[]) =>
  cmds.filter(c => c.type !== 'Z').map(c => ({ x: c.values[c.values.length - 2], y: c.values[c.values.length - 1] }));

describe('#1092 — nearestSegment nombra el borde de cierre', () => {
  it('un clic sobre el borde izquierdo (el de cierre) devuelve el índice del Z', () => {
    const hit = nearestSegment({ x: -2, y: 50 }, RECT);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeLessThan(5);
    // El test viejo solo miraba la distancia; por eso el #1092 pasaba en verde.
    expect(hit!.commandIndex, 'el cierre tiene que nombrarse por su comando Z').toBe(Z);
  });

  it('los otros tres bordes siguen nombrándose por su propio comando', () => {
    expect(nearestSegment({ x: 50, y: -2 }, RECT)!.commandIndex).toBe(1);
    expect(nearestSegment({ x: 102, y: 50 }, RECT)!.commandIndex).toBe(2);
    expect(nearestSegment({ x: 50, y: 102 }, RECT)!.commandIndex).toBe(3);
  });

  it('en un contorno abierto el cierre es fantasma y se nombra con el M (índice 0)', () => {
    const hit = nearestSegment({ x: 48, y: 52 }, ABIERTO);
    expect(hit!.commandIndex).toBe(0);
  });

  it('el índice del cierre resuelve sus DOS extremos por getEdgeEndpoints', () => {
    // Es la pieza que le faltaba al arrastre: la convención ya sabía leerse.
    const ext = getEdgeEndpoints(RECT, Z);
    expect(ext).toEqual({ start: { x: 0, y: 100 }, end: { x: 0, y: 0 } });
  });
});

describe('#1092 — convertir el borde de cierre en curva', () => {
  it('inserta una C antes del Z, y el contorno sigue cerrado', () => {
    const out = convertToCurve(RECT, Z);
    expect(out.map(c => c.type)).toEqual(['M', 'L', 'L', 'L', 'C', 'Z']);
    const c = out[4];
    // La curva va de la última ancla (0,100) al ancla del M (0,0), con los
    // puntos de control a 1/3 y 2/3, como en los otros bordes.
    expect(c.values).toEqual([0, 100 - 100 / 3, 0, 100 - 200 / 3, 0, 0]);
  });

  it('los otros tres bordes se convierten como siempre (no se rompe nada)', () => {
    expect(convertToCurve(RECT, 1).map(c => c.type)).toEqual(['M', 'C', 'L', 'L', 'Z']);
    expect(convertToCurve(RECT, 3).map(c => c.type)).toEqual(['M', 'L', 'L', 'C', 'Z']);
  });

  it('la C insertada queda coincidente con el M: mover ese punto mueve los dos', () => {
    const curvado = convertToCurve(RECT, Z);
    const grupos = coincidentAnchorGroups(curvado);
    const grupo = [...grupos.values()].find(g => g.includes(0));
    expect(grupo, 'el ancla del M y la de la C nueva son el mismo punto').toEqual([0, 4]);
    const movido = applyNodeMove(curvado, 0, 'anchor', { x: -20, y: -20 });
    expect(movido[0].values).toEqual([-20, -20]);
    expect(movido[4].values.slice(4)).toEqual([-20, -20]);
  });

  it('sobre un cierre ya curvado, el hit cae en la C y "convertir en línea" lo devuelve a recto', () => {
    const curvado = convertToCurve(RECT, Z);
    const hit = nearestSegment({ x: -2, y: 50 }, curvado);
    expect(hit!.commandIndex, 'ahora el tramo lo dibuja la C, no el Z').toBe(4);
    const recto = convertToLine(curvado, hit!.commandIndex);
    expect(recto.map(c => c.type)).toEqual(['M', 'L', 'L', 'L', 'L', 'Z']);
  });

  it('en un contorno abierto no inventa un borde: el índice 0 (M) no se convierte', () => {
    expect(convertToCurve(ABIERTO, 0)).toEqual(ABIERTO);
  });
});

describe('#1092 — curva por puntos sobre el borde de cierre', () => {
  it('inserta los tramos antes del Z y conserva el cierre', () => {
    const out = convertSegmentToSpline(RECT, Z, 4);
    expect(out[0].type).toBe('M');
    expect(out[out.length - 1].type, 'el contorno sigue cerrado').toBe('Z');
    expect(out.filter(c => c.type === 'C')).toHaveLength(4);
    // El último punto de la cadena es el ancla del M, exacto.
    const ultimaC = out[out.length - 2];
    expect(ultimaC.values.slice(4)).toEqual([0, 0]);
  });

  it('los otros bordes siguen igual', () => {
    const out = convertSegmentToSpline(RECT, 1, 4);
    expect(out.filter(c => c.type === 'C')).toHaveLength(4);
    expect(out[out.length - 1].type).toBe('Z');
  });
});

describe('#1092 — lo que ya funcionaba sigue funcionando', () => {
  it('splitSegmentAt sobre el cierre inserta una L antes del Z (referencia)', () => {
    const out = splitSegmentAt(RECT, Z, 0.5);
    expect(out.map(c => c.type)).toEqual(['M', 'L', 'L', 'L', 'L', 'Z']);
    expect(out[4].values).toEqual([0, 50]);
  });

  it('extractNodes no emite nodo para el Z, y sí uno por cada ancla', () => {
    expect(extractNodes(pieza(RECT))).toHaveLength(4);
    expect(anclas(RECT)).toHaveLength(4);
  });

  it('applyNodeMove con el índice del Z no corrompe el contorno', () => {
    expect(applyNodeMove(RECT, Z, 'anchor', { x: 9, y: 9 })).toEqual(RECT);
  });
});
