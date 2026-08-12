import type { PatternPiece, Point2D } from '../../../../types/types';
import type { SegmentSelection } from '../../useSegmentSewingTool';
import { getEdgeEndpoints } from '../../../../utils/geometry/path';
import { edgeRangePolyline, slicePolylineByT } from '../../../../utils/seam';

/**
 * Los puntos del arco de un tramo, en coordenadas de patrón (con el offset
 * de la pieza ya aplicado) — la misma parametrización de arco que usa
 * `closeSegment` para producir startT/endT. Null si el borde no resuelve.
 *
 * Extraído de `SegmentHighlight` (SegmentSewingOverlay.tsx) para que
 * `EdgePairOverlay` pueda anclar el número en mm al extremo REAL del arco en
 * vez de re-derivar la geometría (#1029 tanda 1 pt.3): una sola fuente para
 * "dónde cae el tramo en pantalla". Vive en su propio archivo (no en
 * SegmentSewingOverlay.tsx) porque mezclar un export de función con exports
 * de componentes dispara el warning de react-refresh/only-export-components.
 */
export function segmentArcPoints(piece: PatternPiece, segment: SegmentSelection): Point2D[] | null {
  const ox = piece.position?.x ?? 0;
  const oy = piece.position?.y ?? 0;

  // El tramo se recorta del TRAZO del BORDE por fracción de arco — la misma
  // parametrización con la que `closeSegment` devuelve startT/endT. Antes se
  // interpolaba linealmente entre los dos extremos, así que sobre una curva ni
  // la línea ni las dos marcas caían donde ella había clicado (maria #199); y
  // se recortaba del comando en vez del borde, así que un tramo que cruzaba
  // dos comandos se pintaba encogido dentro del primero (maria #199a).
  // La cuerda queda de reserva para lo que el aplanado no cubre (el cierre Z).
  const local = edgeRangePolyline(piece.outline, segment.edgeRange);
  let tramo: Point2D[];
  if (local.length >= 2) {
    tramo = slicePolylineByT(local, segment.startT, segment.endT);
  } else {
    const ep = getEdgeEndpoints(piece.outline, segment.edgeIndex);
    if (!ep) return null;
    const at = (t: number) => ({
      x: ep.start.x + (ep.end.x - ep.start.x) * t,
      y: ep.start.y + (ep.end.y - ep.start.y) * t,
    });
    tramo = [at(segment.startT), at(segment.endT)];
  }
  if (tramo.length < 2) return null;

  return tramo.map(p => ({ x: ox + p.x, y: oy + p.y }));
}
