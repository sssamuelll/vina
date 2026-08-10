import { describe, it, expect } from 'vitest';
import { resolveSeamAllowanceClick, pickEdgeForSeamAllowance } from '../edgeHitTest';
import { generateSeamAllowanceWithCorners } from '../cornerTypes';
import type { PathCommand, PatternPiece, Point2D, SemanticEdge } from '../../../types/types';

/**
 * maria-213 — "cuando clique el resto de la pieza que es una sola curva no
 * identifico bien los márgenes curvos como se ve en la imagen, creando esa V
 * en azul [...] Y que conste que la pieza no tenía esa punta tan afilada que
 * le sale."
 *
 * Dos fallos independientes, los dos reproducidos y medidos el 2026-08-10:
 *
 *  1. Los bordes curvos se trataban como la CUERDA entre sus extremos, tanto
 *     al hit-testear el clic como al pintar el resalte. Con una curva abombada
 *     90mm, clicar justo encima del borde devolvía `saSelection: null` — el
 *     borde curvo era literalmente inseleccionable — y cuando sí se
 *     seleccionaba, el resalte se pintaba con 2 puntos: la V azul de su foto.
 *
 *  2. `cornerMitered` no tenía miter limit. La excursión del margen en un
 *     vértice de ángulo θ es SA / sin(θ/2), sin cota: medido, un margen de
 *     10mm se iba a 114.7mm en una punta de 10° (11.5x) y a 1145.9mm en una de
 *     1° (114.6x). Ese es el pincho que le salió sin haberlo dibujado.
 */

/** Arco que se despega 90mm de su cuerda, como el borde de su pieza. */
const ARCO: PathCommand[] = [
  { type: 'M', values: [0, 100] },
  { type: 'C', values: [113, -20, 227, -20, 340, 100] },
  { type: 'L', values: [340, 290] },
  { type: 'L', values: [0, 290] },
  { type: 'Z', values: [] },
];

const EDGES: SemanticEdge[] = [
  { id: 'e-arco', name: 'topEdge', segmentRange: [1, 2] } as SemanticEdge,
  { id: 'e-der', name: 'rightEdge', segmentRange: [2, 3] } as SemanticEdge,
  { id: 'e-abajo', name: 'bottomEdge', segmentRange: [3, 4] } as SemanticEdge,
];

/** Punto medio real del bezier (t=0.5) del arco de arriba. */
const APEX: Point2D = { x: 170, y: 10 };

describe('maria-213 — un borde curvo se puede clicar donde de verdad pasa', () => {
  it('clicar encima del arco selecciona su borde, no lo ignora', () => {
    const hit = pickEdgeForSeamAllowance(ARCO, EDGES, APEX, 12);
    expect(hit?.id).toBe('e-arco');
  });

  it('el clic sobre la CUERDA del arco ya no cuenta como el arco', () => {
    // (170,100) es el punto medio de la cuerda: 90mm por debajo del trazo real.
    // Antes caía dentro del umbral porque la curva se medía como su cuerda.
    const hit = pickEdgeForSeamAllowance(ARCO, EDGES, { x: 170, y: 100 }, 12);
    expect(hit?.id).not.toBe('e-arco');
  });

  it('los bordes rectos siguen respondiendo igual', () => {
    expect(pickEdgeForSeamAllowance(ARCO, EDGES, { x: 340, y: 200 }, 12)?.id).toBe('e-der');
    expect(pickEdgeForSeamAllowance(ARCO, EDGES, { x: 170, y: 290 }, 12)?.id).toBe('e-abajo');
  });

  it('lejos del contorno sigue sin haber borde', () => {
    expect(pickEdgeForSeamAllowance(ARCO, EDGES, { x: 170, y: 195 }, 12)).toBeNull();
  });

  it('resolveSeamAllowanceClick clasifica el clic del arco como borde, no como pieza', () => {
    const piece = {
      id: 'p1', outline: ARCO, edges: EDGES, position: { x: 500, y: 500 },
    } as unknown as PatternPiece;
    const target = resolveSeamAllowanceClick([piece], { x: 500 + APEX.x, y: 500 + APEX.y }, 10, 12);
    expect(target).toEqual({ kind: 'edge', pieceId: 'p1', edgeId: 'e-arco' });
  });
});

describe('maria-213 — el margen no dispara un pincho en las puntas afiladas', () => {
  /** Distancia del punto al polígono cerrado. */
  function distToRing(p: Point2D, ring: Point2D[]): number {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
      best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
    }
    return best;
  }

  /** Cuña de ángulo `ang` en la punta, con margen `sa`. Devuelve cuánto se
   *  aleja del contorno el punto más lejano del margen. */
  function excursion(ang: number, sa: number): number {
    const half = (ang / 2) * Math.PI / 180;
    const L = 300;
    const ring: Point2D[] = [
      { x: 0, y: 0 },
      { x: -Math.sin(half) * L, y: Math.cos(half) * L },
      { x: Math.sin(half) * L, y: Math.cos(half) * L },
    ];
    const outline: PathCommand[] = [
      { type: 'M', values: [ring[0].x, ring[0].y] },
      { type: 'L', values: [ring[1].x, ring[1].y] },
      { type: 'L', values: [ring[2].x, ring[2].y] },
      { type: 'Z', values: [] },
    ];
    const cmds = generateSeamAllowanceWithCorners(outline, sa, 'mitered', {});
    const pts = cmds.flatMap(c => (c.values.length >= 2 ? [{ x: c.values[0], y: c.values[1] }] : []));
    return pts.reduce((m, p) => Math.max(m, distToRing(p, ring)), 0);
  }

  // Medido antes del fix: 10° → 114.7mm (11.5x), 4° → 286.5mm, 1° → 1145.9mm.
  it.each([
    [10, 114.7],
    [4, 286.5],
    [1, 1145.9],
  ])('una punta de %i° deja de mandar el margen a %fmm', (ang, antes) => {
    const sa = 10;
    const ahora = excursion(ang, sa);
    expect(ahora).toBeLessThan(antes / 2);
    // Cota dura: el margen nunca se aleja del contorno más de 4x lo pedido
    // (el mismo miter-limit por defecto que usan SVG y CSS).
    expect(ahora).toBeLessThanOrEqual(sa * 4 + 0.01);
  });

  it('los ángulos normales de un patrón no cambian de forma', () => {
    // 90° → SA·√2 = 14.14mm; 60° → SA/sin30 = 20mm. Los dos por debajo del
    // límite, así que el trazo tiene que ser el de siempre.
    expect(excursion(90, 10)).toBeCloseTo(26.13, 1); // esquinas de la base a 45°
    expect(excursion(60, 10)).toBeCloseTo(20.0, 1);
  });
});
