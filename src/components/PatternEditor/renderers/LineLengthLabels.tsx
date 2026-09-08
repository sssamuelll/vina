/**
 * LineLengthLabels — one length label per semantic edge of a piece
 * (spec 2026-06-04 display-toggles-resurface §4).
 *
 * View-only: pieces without stored edges (fresh DXF imports) fall back to the
 * pure detectSemanticEdges; detected edges are NOT written back to the store.
 * Rendered inside SinglePiece's transformed <g>, so coordinates are piece-local
 * mm; each label counter-rotates around its own anchor to stay horizontal
 * (same trick as the piece-name label block).
 */
import { useMemo } from 'react';
import type { PatternPiece, SemanticEdge, UnitSystem } from '../../../types/types';
import { computePathArcLength, pointAtPathDistance } from '../../../utils/geometry/arcLength';
import { detectSemanticEdges, rangoMedibleDeBorde } from '../../../utils/semanticEdges';
import { formatDimension } from '../../../utils/units';

interface LineLengthLabelsProps {
  piece: PatternPiece;
  zoom2D: number;
  units: UnitSystem;
}

interface Label {
  id: string;
  x: number;
  y: number;
  text: string;
}

export default function LineLengthLabels({ piece, zoom2D, units }: LineLengthLabelsProps) {
  const labels = useMemo<Label[]>(() => {
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
      if (!mid) continue;
      out.push({ id: edge.id, x: mid.x, y: mid.y, text: formatDimension(len, units) });
    }
    return out;
  }, [piece, units]);

  return (
    <g className="line-length-labels">
      {labels.map(l => (
        <text
          key={l.id}
          x={l.x}
          y={l.y}
          transform={`rotate(${-piece.rotation}, ${l.x}, ${l.y})`}
          fontSize={9 / zoom2D}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
          opacity={0.75}
          style={{ fill: 'var(--ink-on-light)', fontFamily: 'var(--font-mono-2d)' }}
        >
          {l.text}
        </text>
      ))}
    </g>
  );
}
