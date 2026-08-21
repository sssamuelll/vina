import { useState, useCallback, useRef, useMemo } from 'react';
import type { Point2D, PathCommand, PatternPiece } from '../../types/types';
import {
  computeBoundingBox,
  computeHandlePositions,
  hitTestHandle,
  computeScaleFromDrag,
  computeRotationFromDrag,
  scaleAnchorForHandle,
  scaleOutline,
  rotatePoint,
  bboxPivot,
  outlineBBoxCenter,
  type HandleId,
  type BBox,
} from '../../utils/geometry/transform';
import { pieceLocalToPattern } from './pieceTransform';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { reanchorTransformedNotches } from '../../utils/notchReanchor';

interface TransformDragState {
  handleId: HandleId;
  origin: Point2D;
  current: Point2D;
  piecesSnapshot: PatternPiece[];
  bboxSnapshot: BBox;
}

export interface TransformPreview {
  scaleX: number;
  scaleY: number;
  /** Grados, TOTAL: el que la pieza ya traía más lo que va del arrastre. */
  rotationDeg: number;
  /** Punto de giro, en espacio de patrón. */
  pivot: Point2D;
  /** Punto fijo del escalado, en el marco sin girar de la caja. */
  anchor: Point2D;
}

const HANDLE_HIT_THRESHOLD = 8; // screen pixels

export interface TransformUpdate {
  id: string;
  outline: PatternPiece['outline'];
  position: Point2D;
  internals: PatternPiece['internals'];
  /** Grados. El giro es declarativo desde #1033 — ver `handleMouseUp`. */
  rotation: number;
}

/**
 * Carry a piece's internals through the same transform as its outline. The box
 * moves the piece as a plane, so grainlines, darts and piquetes have to move
 * with it — rewriting the outline alone strands every one of them at its old
 * coordinates (nota de María #171, reached by a handle instead of a node).
 * Notches then get their anchors re-derived, which also redraws the mark at
 * its true size rather than stretching it with the piece.
 */
function transformInternals(
  snap: PatternPiece,
  newOutline: PatternPiece['outline'],
  mapPath: (path: PathCommand[]) => PathCommand[],
  mapPoint: (pt: Point2D) => Point2D,
): PatternPiece['internals'] {
  const mapped = snap.internals.map(line => ({ ...line, path: mapPath(line.path) }));
  return reanchorTransformedNotches(mapped, snap.outline, newOutline, mapPoint);
}

export function useTransformTool(
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
  selectedPieceIds: string[],
  onTransform: (updates: TransformUpdate[]) => void,
) {
  const [drag, setDrag] = useState<TransformDragState | null>(null);
  const dragRef = useRef<TransformDragState | null>(null);
  const shiftRef = useRef(false);

  const bbox = useMemo(
    () => computeBoundingBox(pieces, selectedPieceIds),
    [pieces, selectedPieceIds],
  );
  const handles = useMemo(
    () => (bbox ? computeHandlePositions(bbox, zoom2D) : []),
    [bbox, zoom2D],
  );

  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const rect = e.currentTarget.getBoundingClientRect();
      return screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
    },
    [zoom2D, pan2D],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!bbox || handles.length === 0) return false;
      const pt = toPattern(e);
      const threshold = screenToPatternLength(HANDLE_HIT_THRESHOLD, zoom2D);
      const hitId = hitTestHandle(pt, handles, threshold);
      if (!hitId) return false;

      const snapshot = pieces.filter(p => selectedPieceIds.includes(p.id)).map(p => ({
        ...p,
        outline: p.outline.map(cmd => ({ ...cmd, values: [...cmd.values] })),
        position: { ...p.position },
      }));

      const state: TransformDragState = {
        handleId: hitId,
        origin: pt,
        current: pt,
        piecesSnapshot: snapshot,
        bboxSnapshot: { ...bbox },
      };
      dragRef.current = state;
      shiftRef.current = e.shiftKey;
      setDrag(state);
      return true;
    },
    [bbox, handles, toPattern, pieces, selectedPieceIds, zoom2D],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!dragRef.current) return false;
      shiftRef.current = e.shiftKey;
      const pt = toPattern(e);
      const updated = { ...dragRef.current, current: pt };
      dragRef.current = updated;
      setDrag(updated);
      return true;
    },
    [toPattern],
  );

  const handleMouseUp = useCallback(() => {
    const d = dragRef.current;
    if (!d) {
      dragRef.current = null;
      setDrag(null);
      return;
    }

    const snappedBbox = d.bboxSnapshot;
    const updates: TransformUpdate[] = [];

    if (d.handleId === 'rotate') {
      // El giro es DECLARATIVO: escribe `piece.rotation`, el mismo canal que ya
      // usa el menú del clic derecho (`actionCuration.ts:161`). Antes horneaba
      // el ángulo dentro de las coordenadas del contorno, y como la caja se
      // recalculaba desde esas coordenadas, el pivote se mudaba en cada giro:
      // medido en #1033, ida y vuelta dejaba la pieza 5.176 unidades más allá.
      // Con el contorno quieto el pivote no se puede mudar.
      const angle = computeRotationFromDrag(snappedBbox, d.origin, d.current, shiftRef.current);
      const angleDeg = (angle * 180) / Math.PI;
      const groupPivot = bboxPivot(snappedBbox);
      for (const snap of d.piecesSnapshot) {
        // Cada pieza gira sobre su propio centro local; lo que orbita
        // alrededor del pivote del grupo es ese centro. Con una sola pieza
        // seleccionada los dos coinciden y `position` no se mueve ni un pelo.
        const localCenter = outlineBBoxCenter(snap.outline);
        const pivot = { x: snap.position.x + localCenter.x, y: snap.position.y + localCenter.y };
        const moved = rotatePoint(pivot, groupPivot, angle);
        updates.push({
          id: snap.id,
          // Contorno e internas intactos: el grupo entero gira en el
          // renderizador. Tocarlos aquí los giraría DOS veces.
          outline: snap.outline,
          internals: snap.internals,
          position: { x: moved.x - localCenter.x, y: moved.y - localCenter.y },
          rotation: (snap.rotation ?? 0) + angleDeg,
        });
      }
    } else {
      const uniform = ['nw', 'ne', 'sw', 'se'].includes(d.handleId) && !shiftRef.current;
      const { scaleX, scaleY } = computeScaleFromDrag(d.handleId, snappedBbox, d.origin, d.current, uniform);
      // maria-198: el pivote del resize es el lado/esquina OPUESTO al handle
      // — lo que no arrastras queda plantado. Solo rotar pivota en el centro.
      // El ancla llega en el marco SIN girar de la caja, que es el espacio en
      // el que vive el contorno. Lo que hubo que des-girar es el arrastre, y
      // eso ya pasó dentro de `computeScaleFromDrag`.
      const anchor = scaleAnchorForHandle(d.handleId, snappedBbox);
      const rad = ((snappedBbox.rotation ?? 0) * Math.PI) / 180;
      for (const snap of d.piecesSnapshot) {
        const ox = snap.position.x;
        const oy = snap.position.y;
        const localCenter = { x: anchor.x - ox, y: anchor.y - oy };
        const newOutline = scaleOutline(snap.outline, localCenter, scaleX, scaleY);
        // Un solo camino, y sale bien girada o no.
        //
        // El ancla LOCAL ya es punto fijo del escalado: el contorno se estira
        // alrededor de ella y ese punto no se mueve. Lo único que puede
        // moverlo en pantalla es que escalar corre el centro del contorno, que
        // es el pivote del renderizador — y eso es lo que se compensa acá.
        //
        // Con rotación 0 la fórmula devuelve `position` intacta. Eso es lo que
        // maria-198 pedía, y lo que el ajuste viejo rompía: escalaba la
        // posición ADEMÁS de escalar el contorno alrededor del ancla, o sea
        // compensaba dos veces el mismo efecto. Encogía 20 y se corría 20.
        // Sólo se veía en `w`/`n`/`nw`: en `e`/`s`/`se` el ancla coincide con
        // el origen del contorno y el error se cancelaba solo.
        const plantado = pieceLocalToPattern(localCenter, snap);
        const nuevoCentro = outlineBBoxCenter(newOutline);
        const alNuevoPivote = rotatePoint(localCenter, nuevoCentro, rad);
        const newPos = {
          x: plantado.x - alNuevoPivote.x,
          y: plantado.y - alNuevoPivote.y,
        };
        updates.push({
          id: snap.id,
          outline: newOutline,
          position: newPos,
          rotation: snap.rotation ?? 0,
          internals: transformInternals(
            snap,
            newOutline,
            path => scaleOutline(path, localCenter, scaleX, scaleY),
            pt => ({
              x: localCenter.x + (pt.x - localCenter.x) * scaleX,
              y: localCenter.y + (pt.y - localCenter.y) * scaleY,
            }),
          ),
        });
      }
    }

    onTransform(updates);
    dragRef.current = null;
    setDrag(null);
  }, [onTransform]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && dragRef.current) {
      dragRef.current = null;
      setDrag(null);
    }
  }, []);

  // Compute preview transform for rendering ghost during drag
  let preview: TransformPreview | null = null;
  if (drag) {
    const previewBbox = drag.bboxSnapshot;
    const base = previewBbox.rotation ?? 0;
    const pivot = bboxPivot(previewBbox);
    if (drag.handleId === 'rotate') {
      const angle = computeRotationFromDrag(previewBbox, drag.origin, drag.current, shiftRef.current);
      preview = {
        scaleX: 1, scaleY: 1,
        rotationDeg: base + (angle * 180) / Math.PI,
        pivot, anchor: pivot,
      };
    } else {
      const uniform = ['nw', 'ne', 'sw', 'se'].includes(drag.handleId) && !shiftRef.current;
      const { scaleX, scaleY } = computeScaleFromDrag(drag.handleId, previewBbox, drag.origin, drag.current, uniform);
      // Mismo ancla que el commit (maria-198): el fantasma crece desde el
      // lado opuesto, no desde el centro — si no, el preview miente.
      const anchor = scaleAnchorForHandle(drag.handleId, previewBbox);
      preview = { scaleX, scaleY, rotationDeg: base, pivot, anchor };
    }
  }

  const getCursor = useCallback(
    (pt: Point2D): string | null => {
      if (!handles.length) return null;
      const threshold = screenToPatternLength(HANDLE_HIT_THRESHOLD, zoom2D);
      const hitId = hitTestHandle(pt, handles, threshold);
      if (!hitId) return null;
      return handles.find(h => h.id === hitId)?.cursor ?? null;
    },
    [handles, zoom2D],
  );

  return {
    bbox,
    handles,
    isDragging: drag !== null,
    preview,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
  };
}
