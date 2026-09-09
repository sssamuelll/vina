/** Lecturas por borde semántico, en coordenadas locales de la pieza y en mm. */
import type { PatternPiece, Point2D, SemanticEdge, UnitSystem } from '../../../types/types';
import { computePathArcLength, pointAtPathDistance } from '../../../utils/geometry/arcLength';
import { detectSemanticEdges, rangoMedibleDeBorde } from '../../../utils/semanticEdges';
import { formatDimension } from '../../../utils/units';

export interface Label {
  id: string;
  a: Point2D;
  b: Point2D;
  valueMm: number;
  x: number;
  y: number;
  text: string;
}

export function lineLengthLabels(piece: PatternPiece, units: UnitSystem): Label[] {
  const edges: SemanticEdge[] = piece.edges?.length ? piece.edges : detectSemanticEdges(piece);
  const out: Label[] = [];
  for (const edge of edges) {
    // El `segmentRange` de un borde viene en la convención del PRODUCTOR: el
    // tramo de cierre se rotula con el índice de su `M`. Sin traducir, un
    // rectángulo real (`M L L L Z`) le pide el largo al comando 0 — que no
    // dibuja nada— y `pointAtPathDistance` devuelve null, así que el lado
    // izquierdo se queda SIN etiqueta. Era el cuarto consumidor y el único
    // que no traducía (#1120; los otros tres: ElasticRenderer, useMeasureTool
    // y edgeInterpolation).
    const [start, end] = rangoMedibleDeBorde(piece.outline, edge.segmentRange);
    // El largo se calcula SIEMPRE del contorno, nunca del `edge.length`
    // guardado. Ese campo es un derivado que se escribe al detectar los
    // bordes y no se refresca en la ruta que redimensiona por cota: tras
    // editar una pieza a 300×150, las cuatro etiquetas seguían diciendo
    // "100.0 mm" mientras la pieza ya medía 300×150 (encontrado por el
    // replay de la sesión de María, 2026-09-08). El `??` que había aquí
    // prefería el dato viejo, que es la forma clásica de que un derivado
    // guardado le gane a su fuente. El contorno manda; el largo es suyo.
    const len = computePathArcLength(piece.outline, start, end);
    if (len < 1) continue; // degenerate edge
    const mid = pointAtPathDistance(piece.outline, len / 2, start, end);
    const a = pointAtPathDistance(piece.outline, 0, start, end);
    const b = pointAtPathDistance(piece.outline, len, start, end);
    if (!mid || !a || !b) continue;
    out.push({ id: edge.id, a, b, valueMm: len, x: mid.x, y: mid.y, text: formatDimension(len, units) });
  }
  return out;
}
