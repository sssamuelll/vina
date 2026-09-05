import { describe, it, expect } from 'vitest';
import { detectSemanticEdges } from '../semanticEdges';
import { generatePleatFoldLines } from '../pleatGeometry';
import type { PathCommand, PatternPiece, Pleat } from '../../types/types';

/**
 * El pliegue no dibujaba nada. En NINGÚN borde de ninguna pieza.
 *
 * El censo del 2026-09-05 (informe § 12.4) dio a `pleat` por herramienta sin
 * renderizador —«guarda el pliegue en el store y NADIE lo pinta»— y le negó la
 * puerta por eso. Era falso por partida doble:
 *
 *  1. `PieceRenderer.tsx:230-268` SÍ pinta las líneas `type:'fold'`, con sus
 *     triángulos de monte/valle y sus tokens propios (`--fold-mountain-2d`,
 *     `--fold-valley-2d`). El renderizador lleva ahí desde siempre.
 *  2. Lo que fallaba está antes: `generatePleatFoldLines` rebanaba
 *     `outline.slice(rangeStart, rangeEnd)` y aplanaba ESE trozo.
 *
 * `SemanticEdge.segmentRange` está en espacio de COMANDOS, y un comando `L`
 * lleva su punto FINAL, no el inicial. El borde de arriba de un rectángulo es
 * el rango `[1,2]` — o sea, un solo `L(200,0)` —, así que la rebanada daba UN
 * punto, `pts.length < 2` y `return []`. Un borde de un solo comando es el caso
 * NORMAL, no el raro: los cuatro lados de un rectángulo lo son.
 *
 * El test viejo (`pleatGeometry.test.ts`) pasaba en verde porque su fixture
 * declaraba el borde de arriba como `[0, 2]`, incluyendo la `M`. El productor
 * real nunca emite eso: `detectSemanticEdges` da `[1,2]`. Un fixture inventado
 * certificando una función rota — la misma familia que `edgeInterpolation`
 * el 04-09.
 *
 * Por eso este archivo NO declara bordes a mano: se los pide al productor de
 * verdad. Es la única forma de que el verde signifique algo.
 */

const RECT: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 150] },
  { type: 'L', values: [0, 150] },
  { type: 'Z', values: [] },
];

function piezaConBordesDeVerdad(outline: PathCommand[] = RECT): PatternPiece {
  const base = {
    id: 'p', name: 'p', outline, internals: [], position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, seamAllowance: 10, layer: 1, sublayer: 0,
    active: true, edges: [], createdAt: 0, updatedAt: 0,
  } as unknown as PatternPiece;
  return { ...base, edges: detectSemanticEdges(base) } as PatternPiece;
}

function pliegue(over: Partial<Pleat> = {}): Pleat {
  return {
    id: 'pl-1', pieceId: 'p', edgeName: 'topEdge', type: 'knife',
    depth: 15, spacing: 20, count: 3, direction: 'left',
    tStart: 0, tEnd: 1, generatedLineIds: [], ...over,
  };
}

/** Distancia de un punto al segmento a→b. El oráculo de «¿nació sobre su borde?». */
function distanciaAlSegmento(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const largoSq = dx * dx + dy * dy;
  if (largoSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / largoSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Los cuatro lados del rectángulo, por nombre, como segmentos. */
const LADOS: Record<string, [{ x: number; y: number }, { x: number; y: number }]> = {
  topEdge: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
  rightEdge: [{ x: 200, y: 0 }, { x: 200, y: 150 }],
  bottomEdge: [{ x: 200, y: 150 }, { x: 0, y: 150 }],
  leftEdge: [{ x: 0, y: 150 }, { x: 0, y: 0 }],
};

describe('el pliegue se dibuja', () => {
  const piece = piezaConBordesDeVerdad();
  const nombres = piece.edges!.map(e => e.name);

  it('el productor da los cuatro lados como rango de UN comando', () => {
    // Si esto cambia, el defecto de abajo cambia de forma y hay que releer.
    expect(nombres.sort()).toEqual(['bottomEdge', 'leftEdge', 'rightEdge', 'topEdge']);
    for (const e of piece.edges!) {
      expect(e.segmentRange[1] - e.segmentRange[0], `${e.name} dejó de ser un comando`).toBe(1);
    }
  });

  it.each(['topEdge', 'rightEdge', 'bottomEdge', 'leftEdge'])(
    'un pliegue de cuchillo sobre %s genera sus tres pliegues',
    (nombre) => {
      const lineas = generatePleatFoldLines(pliegue({ edgeName: nombre, count: 3 }), piece);
      expect(lineas.length, `${nombre} no generó ni una línea de pliegue`).toBe(3);
      for (const l of lineas) {
        expect(l.type).toBe('fold');
        expect(l.foldOptions?.pleatId).toBe('pl-1');
      }
    },
  );

  it.each(['topEdge', 'rightEdge', 'bottomEdge', 'leftEdge'])(
    'y cada pliegue de %s ARRANCA sobre ese borde, no sobre otro',
    (nombre) => {
      // El oráculo que importa: generar líneas no basta; tienen que nacer en el
      // borde que la usuaria clicó. Un corrimiento de borde es exactamente el
      // defecto que `trimPlace` tenía el 04-09.
      const lineas = generatePleatFoldLines(pliegue({ edgeName: nombre, count: 3 }), piece);
      // Sin esta línea el `for` de abajo pasa en vacío y certifica el bug.
      expect(lineas.length, `${nombre} no generó nada que comprobar`).toBe(3);
      const [a, b] = LADOS[nombre];
      for (const l of lineas) {
        const inicio = l.path[0];
        expect(inicio.type).toBe('M');
        const p = { x: inicio.values[0], y: inicio.values[1] };
        expect(
          distanciaAlSegmento(p, a, b),
          `un pliegue de ${nombre} nació en (${p.x}, ${p.y}), fuera de su borde`,
        ).toBeLessThan(0.01);
      }
    },
  );

  it('el acordeón pone dos líneas por repetición, monte y valle', () => {
    const lineas = generatePleatFoldLines(pliegue({ type: 'accordion', count: 2 }), piece);
    expect(lineas).toHaveLength(4);
    expect(lineas.map(l => l.foldOptions?.direction)).toEqual(
      ['mountain', 'valley', 'mountain', 'valley'],
    );
  });

  it('el pliegue mide su profundidad de verdad, perpendicular al borde', () => {
    const lineas = generatePleatFoldLines(pliegue({ edgeName: 'topEdge', count: 1, depth: 15 }), piece);
    expect(lineas).toHaveLength(1);
    const [ini, fin] = lineas[0].path;
    const largo = Math.hypot(fin.values[0] - ini.values[0], fin.values[1] - ini.values[1]);
    expect(largo).toBeCloseTo(15, 5);
  });
});
