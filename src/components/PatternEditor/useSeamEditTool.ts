import { useState, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { selectSeam, clearSelection } from '../../store/editorSlice';
import type { PatternPiece, Point2D, Seam } from '../../types/types';
import { screenToPattern, resolveEdgeName } from './sewingUtils';
import { snapToAnyEdge } from './useSegmentSewingTool';
import { seamsOnEdge, nextSeamOnEdge } from './seamEdgeLookup';
import { noPasoNada } from './noPasoNada';

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
  isHoverEnabled = true,
) {
  const dispatch = useDispatch();
  const selectedSeamId = useSelector((s: RootState) => s.editor.selectedSeamId);
  const [hoveredSeamIds, setHoveredSeamIds] = useState<string[]>([]);

  useEffect(() => {
    if (isHoverEnabled) return;
    setHoveredSeamIds(current => current.length === 0 ? current : []);
  }, [isHoverEnabled]);

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

  /** ¿El cursor enganchó un borde? Separa "borde sin costura" de "aire". */
  const hayBordeDebajo = useCallback((e: React.MouseEvent<SVGSVGElement>): boolean => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    return snapToAnyEdge(pt, pieces, zoom, undefined, undefined) !== null;
  }, [zoom, pan, pieces]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    // Sin borde debajo esto es el vacío del lienzo, no un gesto que murió: no
    // se avisa. La distinción importa — un aviso por cada clic al aire sería
    // ruido, y la tira dejaría de significar algo (#1117).
    if (!hayBordeDebajo(e)) return;
    const onEdge = seamsUnder(e);
    // Borde libre. Seguía siendo un no-op declarado "a propósito", y para María
    // eso es la herramienta rota: apretó sobre un borde de verdad y no pasó
    // nada (#1098). Crear la costura sigue siendo la otra herramienta; lo que
    // cambia es que ahora lo dice en vez de callarse.
    if (onEdge.length === 0) {
      noPasoNada('costuras:borde-sin-costura');
      return;
    }
    const next = nextSeamOnEdge(onEdge, selectedSeamId);
    if (next) dispatch(selectSeam(next.id));
  }, [hayBordeDebajo, seamsUnder, selectedSeamId, dispatch]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const nextIds = seamsUnder(e).map(seam => seam.id);
    setHoveredSeamIds(current => (
      current.length === nextIds.length && current.every((id, index) => id === nextIds[index])
        ? current
        : nextIds
    ));
  }, [seamsUnder]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') dispatch(clearSelection());
  }, [dispatch]);

  // Solo la lista: un borde puede llevar varias costuras (`seamsOnEdge` devuelve
  // todas), y dejar tambien un `hoveredSeamId` singular invita a que el proximo
  // consumidor pierda en silencio las demas — que era justo el bug de #1110.
  /** El ratón salió del lienzo: el resalte se va con él (#1132). */
  const limpiarHover = useCallback(() => {
    setHoveredSeamIds(current => (current.length === 0 ? current : []));
  }, []);

  return { hoveredSeamIds, handleMouseDown, handleMouseMove, handleKeyDown, limpiarHover };
}
