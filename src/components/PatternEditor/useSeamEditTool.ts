import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { selectSeam, clearSelection } from '../../store/editorSlice';
import type { PatternPiece, Point2D, Seam } from '../../types/types';
import { screenToPattern, resolveEdgeName } from './sewingUtils';
import { snapToAnyEdge } from './useSegmentSewingTool';
import { seamsOnEdge, nextSeamOnEdge } from './seamEdgeLookup';

/**
 * Editar costuras (#219). El gemelo de inspección de la herramienta de coser.
 *
 * María: "si clico una linea que lleva costura para entender con que otra línea
 * esta cosida, no siempre me muestra esa información [...] es como si estuviera
 * en modo volver a aplicar costura a esa línea."
 *
 * El resalte de ambas mitades YA existe (SeamRenderer lo pinta cuando hay una
 * costura seleccionada). Lo que faltaba era una puerta: aquí el objetivo del
 * hit-test es el BORDE entero, no el trazo de 2,5 px de la costura.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 4.3
 */
export function useSeamEditTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  seams: Seam[],
) {
  const dispatch = useDispatch();
  const selectedSeamId = useSelector((s: RootState) => s.editor.selectedSeamId);
  const [hoveredSeamId, setHoveredSeamId] = useState<string | null>(null);

  /** Qué costuras hay bajo el cursor, por el borde que engancha. */
  const seamsUnder = useCallback((e: React.MouseEvent<SVGSVGElement>): Seam[] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    const snap = snapToAnyEdge(pt, pieces, zoom, undefined, undefined);
    if (!snap) return [];
    const piece = pieces.find(p => p.id === snap.pieceId);
    if (!piece) return [];
    return seamsOnEdge(seams, snap.pieceId, resolveEdgeName(piece, snap.edgeIndex));
  }, [zoom, pan, pieces, seams]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const onEdge = seamsUnder(e);
    // Borde libre: no pasa nada, a propósito. Crear es la otra herramienta.
    if (onEdge.length === 0) return;
    const next = nextSeamOnEdge(onEdge, selectedSeamId);
    if (next) dispatch(selectSeam(next.id));
  }, [seamsUnder, selectedSeamId, dispatch]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const onEdge = seamsUnder(e);
    setHoveredSeamId(onEdge[0]?.id ?? null);
  }, [seamsUnder]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') dispatch(clearSelection());
  }, [dispatch]);

  return { hoveredSeamId, handleMouseDown, handleMouseMove, handleKeyDown };
}
