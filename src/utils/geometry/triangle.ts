import type { PathCommand, Point2D } from '../../types/types';

/**
 * Triángulo isósceles y triángulo rectángulo, hermanos de `ellipse.ts`
 * (#1111, tanda 8: María pidió «círculo y triángulo»; el círculo ya nació).
 *
 * Los dos se INSCRIBEN en la caja arrastrada (x,y,w,h), igual que la elipse
 * se inscribe en la del círculo — nunca desde el centro (dos gramáticas para
 * dos herramientas de dibujo hermanas es la deriva que la revisión adversarial
 * del 2026-09-04 midió y que #1111 no reabre).
 *
 * Solo tres vértices y `Z` cierra el contorno — nunca se repite el primer
 * punto con un `L` final. Eso tapó un bug real durante meses en este repo
 * (#1120): `commandsToShape` (`PieceMesh.tsx`) ya cierra el `THREE.Shape` con
 * el propio `Z`, así que un `L` de vuelta al primer punto duplica el vértice.
 */

/**
 * Los tres vértices del isósceles: ápice arriba-centro, base abajo. Fijo — NO
 * depende de hacia dónde se arrastró el gesto, a diferencia del rectángulo:
 * «el isósceles va con el ápice arriba-centro» es la decisión escrita.
 */
export function isoscelesTriangleVertices(x: number, y: number, w: number, h: number): [Point2D, Point2D, Point2D] {
  return [
    { x: x + w / 2, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/**
 * Los tres vértices del triángulo rectángulo: el ángulo recto cae en la
 * esquina del PRESS — la gramática de «ancla en la esquina» que Rectángulo y
 * Círculo ya establecieron. Un box calculado con min/max no conserva de qué
 * lado se arrastró, así que `cornerLeft`/`cornerTop` lo dicen aparte (true =
 * el press cayó en el lado izquierdo/superior de la caja).
 */
export function rightTriangleVertices(
  x: number, y: number, w: number, h: number,
  cornerLeft: boolean, cornerTop: boolean,
): [Point2D, Point2D, Point2D] {
  const cx = cornerLeft ? x : x + w;
  const cy = cornerTop ? y : y + h;
  return [
    { x: cx, y: cy },
    { x: cornerLeft ? x + w : x, y: cy },
    { x: cx, y: cornerTop ? y + h : y },
  ];
}

/**
 * Sentido de recorrido (fórmula del zapatero) de los tres vértices.
 *
 * Importa porque el rectángulo (`M L L L Z`), la elipse y el isósceles emiten
 * los tres el MISMO sentido, y el triángulo rectángulo sería el único contorno
 * del repo que emite los dos: anclar el ángulo recto en la esquina del press
 * invierte el recorrido en dos de las cuatro direcciones de arrastre.
 *
 * Hoy no rompe nada — se auditó: `bomExport`/`bomExtractor` toman valor
 * absoluto, `offsetOutline` y `cdtMesher` normalizan por su cuenta, y
 * `resolveNotchAnchor` se ADAPTA al signo para su normal hacia dentro. Se
 * normaliza para no dejar la única forma con dos sentidos, no para arreglar un
 * fallo vivo: el pliegue ya nos enseñó lo caro que sale un contorno cuyo
 * sentido nadie garantiza.
 */
function sentido(pts: readonly [Point2D, Point2D, Point2D]): number {
  return (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y)
       - (pts[2].x - pts[0].x) * (pts[1].y - pts[0].y);
}

const trianguloPath = (pts: readonly [Point2D, Point2D, Point2D]): PathCommand[] => {
  // Solo se invierte el ORDEN de recorrido: los tres puntos son los mismos, así
  // que el ángulo recto sigue cayendo donde cayó el press.
  const [a, b, c] = sentido(pts) < 0 ? [pts[0], pts[2], pts[1]] : pts;
  return [
    { type: 'M', values: [a.x, a.y] },
    { type: 'L', values: [b.x, b.y] },
    { type: 'L', values: [c.x, c.y] },
    { type: 'Z', values: [] },
  ];
};

export function isoscelesTrianglePath(x: number, y: number, w: number, h: number): PathCommand[] {
  return trianguloPath(isoscelesTriangleVertices(x, y, w, h));
}

export function rightTrianglePath(
  x: number, y: number, w: number, h: number,
  cornerLeft: boolean, cornerTop: boolean,
): PathCommand[] {
  return trianguloPath(rightTriangleVertices(x, y, w, h, cornerLeft, cornerTop));
}
