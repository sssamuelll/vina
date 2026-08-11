import { describe, it, expect } from 'vitest';
import {
  snapToEdge, buildSegmentSeam, closeSegment,
  type SegmentSelection, type SnapResult,
} from '../useSegmentSewingTool';
import { edgeRangeForCommand } from '../../../utils/semanticEdges';
import type { PatternPiece, SemanticEdge } from '../../../types/types';

// A simple square piece: M 0,0 L 100,0 L 100,100 L 0,100 Z
const squarePiece: PatternPiece = {
  id: 'p1',
  name: 'Square',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },   // edge 1: top (0,0)→(100,0)
    { type: 'L', values: [100, 100] }, // edge 2: right (100,0)→(100,100)
    { type: 'L', values: [0, 100] },   // edge 3: bottom (100,100)→(0,100)
    { type: 'Z', values: [] },          // edge 4: left (0,100)→(0,0)
  ],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  internals: [],
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

describe('snapToEdge', () => {
  it('snaps to middle of top edge', () => {
    const result = snapToEdge({ x: 50, y: 2 }, squarePiece, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1);
    expect(result!.point.x).toBeCloseTo(50, 0);
    expect(result!.point.y).toBeCloseTo(0, 0);
    expect(result!.t).toBeCloseTo(0.5, 1);
  });

  it('snaps to start of right edge', () => {
    const result = snapToEdge({ x: 98, y: 5 }, squarePiece, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(2);
    expect(result!.point.x).toBeCloseTo(100, 0);
    expect(result!.t).toBeLessThan(0.1);
  });

  it('returns null when point is far from outline', () => {
    const result = snapToEdge({ x: 50, y: 50 }, squarePiece, 1);
    expect(result).toBeNull();
  });

  it('accounts for piece position offset', () => {
    const offsetPiece = { ...squarePiece, position: { x: 200, y: 200 } };
    const result = snapToEdge({ x: 250, y: 202 }, offsetPiece, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1);
    expect(result!.point.x).toBeCloseTo(250, 0);
    expect(result!.point.y).toBeCloseTo(200, 0);
  });

  it('constrains to same edge when edgeConstraint is given', () => {
    const result = snapToEdge({ x: 95, y: 5 }, squarePiece, 1, [1, 2]);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1);
  });
});

// ─── buildSegmentSeam — issue #1022: los tramos parciales viajan al Seam ─────
//
// La mitigación full-segment-snap (parity plan Fase 5 § 5) descartaba
// startT/endT citando un solver sin renormalización. Ese solver ya no existe
// (renormalizeFilteredT en seamAssembly + seamPairs; verificado con números en
// src/utils/cloth/__tests__/seamPartialRange.test.ts), así que el gesto debe
// despachar el sub-rango real. Convención de seamRange.ts: rango COMPLETO =
// campos ausentes, nunca 0/1 explícitos. t del Seam = fracción de ARCO sobre
// el edge semántico completo (que puede abarcar varios comandos), no el t
// local del comando clicado.

function makeSemanticPiece(id: string, edges: SemanticEdge[]): PatternPiece {
  return { ...squarePiece, id, edges };
}

const squareEdges = [
  { id: 'e-top', name: 'top', segmentRange: [1, 2] },
  { id: 'e-right', name: 'right', segmentRange: [2, 3] },
  { id: 'e-bottom', name: 'bottom', segmentRange: [3, 4] },
] as SemanticEdge[];

function seg(pieceId: string, edgeIndex: number, startT: number, endT: number): SegmentSelection {
  return {
    pieceId, edgeIndex, edgeRange: [edgeIndex, edgeIndex + 1], startT, endT,
    startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 },
  };
}

/** Snap sintético: lo que devolvería un clic sobre `edgeIndex` a la `t` dada. */
function snap(pieceId: string, edgeIndex: number, t: number): SnapResult {
  return { pieceId, edgeIndex, t, point: { x: 0, y: 0 } };
}

describe('buildSegmentSeam', () => {
  const pA = makeSemanticPiece('pA', squareEdges);
  const pB = makeSemanticPiece('pB', squareEdges);
  const pieces = [pA, pB];

  it('clics de borde completo (t 0→1) producen un seam SIN tStart/tEnd', () => {
    const seam = buildSegmentSeam(seg('pA', 1, 0, 1), seg('pB', 3, 0, 1), pieces, 'standard');
    expect(seam.pieceA).toEqual({ pieceId: 'pA', edgeName: 'top' });
    expect(seam.pieceB).toEqual({ pieceId: 'pB', edgeName: 'bottom' });
    expect(seam.type).toBe('standard');
  });

  it('un tramo parcial lleva tStart/tEnd (edge de un solo comando: t comando == t edge)', () => {
    const seam = buildSegmentSeam(seg('pA', 1, 0.25, 0.75), seg('pB', 3, 0, 1), pieces, 'standard');
    expect(seam.pieceA.tStart).toBeCloseTo(0.25, 5);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.75, 5);
    // El lado B fue completo: sin campos.
    expect(seam.pieceB.tStart).toBeUndefined();
    expect(seam.pieceB.tEnd).toBeUndefined();
  });

  // La conversión comando→arco-del-borde vive en `closeSegment` (el gesto), no
  // aquí: los dos clics pueden caer en comandos distintos y sus `t` locales no
  // son comparables entre sí hasta convertirlos (maria #199a). Este caso probaba
  // esa conversión y se muda con ella, con los mismos números.
  it('edge semántico multi-comando: el gesto convierte el t del comando a arco del edge', () => {
    // Top partido en dos comandos de largos 30 y 70: el edge 'top' cubre [1,3).
    const splitTop: PatternPiece = {
      ...squarePiece,
      id: 'pSplit',
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [30, 0] },   // 1: primer tramo del top (30)
        { type: 'L', values: [100, 0] },  // 2: segundo tramo del top (70)
        { type: 'L', values: [100, 100] }, // 3: right
        { type: 'L', values: [0, 100] },  // 4: bottom
        { type: 'Z', values: [] },
      ],
      edges: [
        { id: 'e-top', name: 'top', segmentRange: [1, 3] },
        { id: 'e-right', name: 'right', segmentRange: [3, 4] },
      ] as SemanticEdge[],
    };
    // Todo el comando 2 = del 30% al 100% del arco del edge 'top'.
    const selA = closeSegment(snap('pSplit', 2, 0), snap('pSplit', 2, 1), splitTop)!;
    const seam = buildSegmentSeam(selA, seg('pB', 3, 0, 1), [splitTop, pB], 'standard');
    expect(seam.pieceA.edgeName).toBe('top');
    expect(seam.pieceA.tStart).toBeCloseTo(0.3, 5);
    expect(seam.pieceA.tEnd).toBeCloseTo(1.0, 5);
    // Mitad final del comando 1 = del 15% al 30% del arco.
    const selB = closeSegment(snap('pSplit', 1, 0.5), snap('pSplit', 1, 1), splitTop)!;
    const seam2 = buildSegmentSeam(selB, seg('pB', 3, 0, 1), [splitTop, pB], 'standard');
    expect(seam2.pieceA.tStart).toBeCloseTo(0.15, 5);
    expect(seam2.pieceA.tEnd).toBeCloseTo(0.3, 5);
  });

  it('clic casi en el vértice (a <1% del extremo) redondea al extremo exacto', () => {
    const seam = buildSegmentSeam(seg('pA', 1, 0.004, 0.6), seg('pB', 3, 0, 1), pieces, 'standard');
    expect(seam.pieceA.tStart).toBe(0);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.6, 5);
  });

  it('casi-completo por las dos puntas colapsa a completo (campos ausentes)', () => {
    const seam = buildSegmentSeam(seg('pA', 1, 0.004, 0.997), seg('pB', 3, 0, 1), pieces, 'standard');
    expect(seam.pieceA.tStart).toBeUndefined();
    expect(seam.pieceA.tEnd).toBeUndefined();
  });

  it('pieza legacy sin edges: nombre edge-N y t del comando pasa directo', () => {
    const legacyA = { ...squarePiece, id: 'pLegacy' };
    const seam = buildSegmentSeam(seg('pLegacy', 1, 0.2, 0.5), seg('pB', 3, 0, 1), [legacyA, pB], 'overlock');
    expect(seam.pieceA.edgeName).toBe('edge-1');
    expect(seam.pieceA.tStart).toBeCloseTo(0.2, 5);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.5, 5);
    expect(seam.type).toBe('overlock');
  });
});

/**
 * maria-199, segunda vuelta (2026-08-10) — "Y YA CLICAR CURVAS AL HACER LA
 * COSTURA ES OTRO TEMA Y FUNCIONA FATAL, CREA COSTYRA EN RECTA, SIN SEGUIR LA
 * CURVA".
 *
 * `snapToEdge` proyectaba el clic sobre la CUERDA del comando: `getEdgeEndpoints`
 * devuelve los dos extremos y el umbral de 8px se medía contra la recta entre
 * ellos. Sobre un arco abombado eso significa dos cosas a la vez:
 *
 *   - clicar justo ENCIMA de la curva no engancha nada, porque la cuerda está
 *     lejos (el mismo fallo que tenía el margen de costura en el #213);
 *   - y cuando engancha, el punto marcado y su `t` viven en la cuerda, no en el
 *     trazo — así que la marca cae fuera de la línea.
 *
 * Es el mismo arco de la pieza de su foto: se despega 90mm de su cuerda.
 */
const arcoPiece: PatternPiece = {
  ...squarePiece,
  id: 'p-arco',
  outline: [
    { type: 'M', values: [0, 100] },
    { type: 'C', values: [113, -20, 227, -20, 340, 100] }, // edge 1: el arco
    { type: 'L', values: [340, 290] },                     // edge 2: recta
    { type: 'L', values: [0, 290] },                       // edge 3: recta
    { type: 'Z', values: [] },
  ],
};

/** Punto medio real del bezier (t=0.5). La cuerda pasa 90mm por debajo. */
const APEX = { x: 170, y: 10 };

describe('maria-199 — coser un borde curvo lo clica donde de verdad pasa', () => {
  it('clicar encima del arco engancha ese borde', () => {
    const snap = snapToEdge(APEX, arcoPiece, 1);
    expect(snap).not.toBeNull();
    expect(snap!.edgeIndex).toBe(1);
  });

  it('la marca cae SOBRE la curva, no sobre la cuerda', () => {
    const snap = snapToEdge(APEX, arcoPiece, 1);
    // La cuerda está en y=100; el trazo real pasa por y=10.
    expect(snap!.point.y).toBeLessThan(40);
  });

  it('la t es fracción de ARCO del comando: el ápex cae a la mitad', () => {
    const snap = snapToEdge(APEX, arcoPiece, 1);
    expect(snap!.t).toBeCloseTo(0.5, 1);
  });

  it('clicar sobre la CUERDA del arco ya no cuenta como el arco', () => {
    // (170,100) es el punto medio de la cuerda: 90mm por debajo del trazo.
    const snap = snapToEdge({ x: 170, y: 100 }, arcoPiece, 1);
    expect(snap?.edgeIndex).not.toBe(1);
  });

  it('los bordes rectos siguen enganchando exactamente igual', () => {
    const der = snapToEdge({ x: 340, y: 200 }, arcoPiece, 1);
    expect(der?.edgeIndex).toBe(2);
    expect(der!.t).toBeCloseTo(0.5263, 3); // (200-100)/190

    const abajo = snapToEdge({ x: 170, y: 290 }, arcoPiece, 1);
    expect(abajo?.edgeIndex).toBe(3);
    expect(abajo!.t).toBeCloseTo(0.5, 3);
  });

  it('lejos del contorno sigue sin haber snap', () => {
    expect(snapToEdge({ x: 170, y: 195 }, arcoPiece, 1)).toBeNull();
  });
});

/**
 * maria-199a, tercera vuelta (2026-08-10) — "NO CONSIGO CLICAR DOLO CIERTO
 * TRAMO DE UNA LINEA RECTA".
 *
 * El #1022 soltó el freno del dato (el sub-rango ya viaja al Seam) pero el
 * GESTO seguía atado al comando. La pista dice "clic más adelante en el mismo
 * BORDE" y el código constreñía al mismo COMANDO (`edgeConstraint =
 * pendingSnap.edgeIndex`). Coinciden solo cuando el borde es un único comando
 * — o sea, en un rectángulo dibujado a mano, que es justo con lo que estaban
 * escritos todos los tests.
 *
 * En un patrón de verdad no coinciden nunca:
 *   - los DXF traen los contornos como polilíneas densas de `L`
 *     (outlineAnalysis.ts lo dice en su cabecera), y
 *   - basta que ella añada UN punto a un lado recto (la herramienta punto, o
 *     "convertir en puntos") para partirlo en dos comandos.
 *
 * Entonces el segundo clic cae en otro comando, `snapToEdge` devuelve null y
 * el reductor hace `return prev`: no pasa absolutamente nada, sin ninguna
 * señal. Literalmente no consigue marcar el tramo.
 *
 * La unidad del gesto pasa a ser el BORDE SEMÁNTICO, que es la unidad en la
 * que ya vivía el dato (`Seam.tStart/tEnd` = fracción de arco del edge, ver
 * seamRange.ts). Sin edges semánticos se cae al comando, como antes.
 */
const rectaPartida: PatternPiece = {
  ...squarePiece,
  id: 'p-partida',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [30, 0] },    // 1: primer tercio del lado de arriba
    { type: 'L', values: [100, 0] },   // 2: el resto del MISMO lado recto
    { type: 'L', values: [100, 100] }, // 3: derecha
    { type: 'L', values: [0, 100] },   // 4: abajo
    { type: 'Z', values: [] },         // 5: izquierda
  ],
  edges: [
    { id: 'e-top', name: 'top', segmentRange: [1, 3] },
    { id: 'e-right', name: 'right', segmentRange: [3, 4] },
    { id: 'e-bottom', name: 'bottom', segmentRange: [4, 5] },
  ] as SemanticEdge[],
};

describe('maria-199a — marcar un tramo dentro de un borde de varios comandos', () => {
  it('el snap constreñido acepta cualquier comando del borde, no solo uno', () => {
    // Clic al 60% del lado de arriba, con el gesto ya anclado al borde [1,3).
    const snap = snapToEdge({ x: 60, y: 2 }, rectaPartida, 1, [1, 3]);
    expect(snap).not.toBeNull();
    expect(snap!.edgeIndex).toBe(2); // otro comando, mismo borde
    expect(snap!.point.x).toBeCloseTo(60, 0);
  });

  it('el rango sigue siendo una frontera: fuera del borde no engancha', () => {
    // (100,50) está en el lado derecho, que es otro borde.
    expect(snapToEdge({ x: 100, y: 50 }, rectaPartida, 1, [1, 3])).toBeNull();
  });

  it('dos clics en comandos distintos cierran el tramo (hoy no pasa nada)', () => {
    const a = snapToEdge({ x: 20, y: 2 }, rectaPartida, 1)!;
    expect(a.edgeIndex).toBe(1);
    const b = snapToEdge({ x: 60, y: 2 }, rectaPartida, 1, edgeRangeForCommand(rectaPartida, a.edgeIndex))!;
    expect(b.edgeIndex).toBe(2);

    const sel = closeSegment(a, b, rectaPartida);
    expect(sel).not.toBeNull();
    expect(sel!.edgeRange).toEqual([1, 3]);
    // t en arco del BORDE entero (largo 100), no del comando clicado.
    expect(sel!.startT).toBeCloseTo(0.2, 3);
    expect(sel!.endT).toBeCloseTo(0.6, 3);
  });

  it('el tramo cruzado llega al Seam como fracción de arco del borde', () => {
    const a = snapToEdge({ x: 20, y: 2 }, rectaPartida, 1)!;
    const b = snapToEdge({ x: 60, y: 2 }, rectaPartida, 1, [1, 3])!;
    const sel = closeSegment(a, b, rectaPartida)!;
    const otro = closeSegment(
      snapToEdge({ x: 50, y: 98 }, squarePiece, 1)!,
      snapToEdge({ x: 20, y: 98 }, squarePiece, 1)!,
      squarePiece,
    )!;
    const seam = buildSegmentSeam(sel, otro, [rectaPartida, squarePiece], 'standard');
    expect(seam.pieceA.edgeName).toBe('top');
    expect(seam.pieceA.tStart).toBeCloseTo(0.2, 3);
    expect(seam.pieceA.tEnd).toBeCloseTo(0.6, 3);
  });

  it('un borde de un solo comando se comporta igual que siempre', () => {
    const a = snapToEdge({ x: 100, y: 20 }, rectaPartida, 1)!;
    const b = snapToEdge({ x: 100, y: 80 }, rectaPartida, 1, edgeRangeForCommand(rectaPartida, a.edgeIndex))!;
    const sel = closeSegment(a, b, rectaPartida)!;
    expect(sel.edgeRange).toEqual([3, 4]);
    expect(sel.startT).toBeCloseTo(0.2, 3);
    expect(sel.endT).toBeCloseTo(0.8, 3);
  });

  it('sin edges semánticos el gesto se queda en su comando, como antes', () => {
    // squarePiece no trae `edges`: cada comando es su propio borde.
    expect(edgeRangeForCommand(squarePiece, 2)).toEqual([2, 3]);
    expect(snapToEdge({ x: 50, y: 2 }, squarePiece, 1, [2, 3])).toBeNull();
  });

  it('dos clics en el mismo sitio no cierran tramo', () => {
    const a = snapToEdge({ x: 60, y: 2 }, rectaPartida, 1)!;
    expect(closeSegment(a, a, rectaPartida)).toBeNull();
  });
});
