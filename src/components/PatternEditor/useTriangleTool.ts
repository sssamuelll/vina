import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setToolOption } from '../../store/toolSlice';
import { Point2D, PathCommand, InternalLine } from '../../types/types';
import { screenToPattern, isoscelesTriangleVertices, rightTriangleVertices } from '../../utils/geometry';
import { draftedPieceDefaults } from '../../utils/defaults';
import { isDrag } from './gestureConstants';
import { pushJournal } from '../../utils/telemetry/journal';
import { noPasoNada } from './noPasoNada';

interface NewPieceData {
  name: string;
  outline: PathCommand[];
  internals: InternalLine[];
  position: Point2D;
  rotation: number;
  mirrored: boolean;
  seamAllowance: number;
  layer: number;
  sublayer: number;
  active: boolean;
}

interface Press {
  start: Point2D;
  screen: Point2D;
  current: Point2D;
  moved: boolean;
}

const DEFAULT_MM = 100;
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Los tres vértices según la figura puesta en la cabina: el isósceles nunca
 *  mira hacia dónde se arrastró (ápice arriba-centro, fijo); el rectángulo
 *  ancla su ángulo recto en la esquina del press. */
function verticesDe(
  figura: string, x: number, y: number, w: number, h: number,
  cornerLeft: boolean, cornerTop: boolean,
): [Point2D, Point2D, Point2D] {
  return figura === 'right'
    ? rightTriangleVertices(x, y, w, h, cornerLeft, cornerTop)
    : isoscelesTriangleVertices(x, y, w, h);
}

const toPath = (pts: [Point2D, Point2D, Point2D]): PathCommand[] => [
  { type: 'M', values: [pts[0].x, pts[0].y] },
  { type: 'L', values: [pts[1].x, pts[1].y] },
  { type: 'L', values: [pts[2].x, pts[2].y] },
  { type: 'Z', values: [] },
];

/**
 * Triángulo (#1111, tanda 8 — María pidió «círculo y triángulo»; el círculo ya
 * nació con este mismo molde en el commit anterior).
 *
 * Copia estructural de `useRectangleTool`, a propósito: el press manda el
 * objeto y el release manda el valor. Soltar sin haberse movido crea con la
 * Base y la Altura de la barra, esquina superior izquierda en el press —el
 * mismo "clicas con el izquierdo y lo crea" de Rectángulo y Círculo—, y soltar
 * habiéndose movido crea lo dibujado y lo escribe en la barra.
 *
 * Dos diferencias con su hermano:
 *
 * 1. La barra ofrece DOS figuras (spec #1111, decisión 2): isósceles —ápice
 *    arriba-centro, inscrito en la caja— y rectángulo —ángulo recto en la
 *    esquina del press—. Un box de min/max no conserva de qué lado se
 *    arrastró, así que `cornerLeft`/`cornerTop` se recalculan del signo del
 *    recorrido en cada release.
 * 2. `create()` construye TRES vértices y cierra con `Z` — nunca repite el
 *    primer punto con un `L` final (#1120, el bug que tapó meses).
 */
export function useTriangleTool(
  zoom2D: number,
  pan2D: Point2D,
  /** Devuelve el id de la pieza creada: la creación caliente (spec cotas vivas § 3.1) lo necesita. */
  onComplete: (piece: NewPieceData) => string,
) {
  const dispatch = useDispatch();
  const barBase = useSelector((s: RootState) => Number(s.tools.toolOptions?.triangle?.base ?? DEFAULT_MM));
  const barAltura = useSelector((s: RootState) => Number(s.tools.toolOptions?.triangle?.altura ?? DEFAULT_MM));
  const barFigura = useSelector((s: RootState) => String(s.tools.toolOptions?.triangle?.shapeType ?? 'isosceles'));
  const barRef = useRef({ base: barBase, altura: barAltura, figura: barFigura });
  barRef.current = { base: barBase, altura: barAltura, figura: barFigura };

  const pressRef = useRef<Press | null>(null);
  /** La pieza que este hook acaba de crear, mientras siga seleccionada y la
   *  herramienta sea Triángulo. `PatternEditor` la enfría (a null) en cuanto
   *  eso deja de ser cierto, y no vuelve a calentarse sola (spec § 3.1). */
  const [hotId, setHotId] = useState<string | null>(null);
  const enfriar = useCallback(() => setHotId(null), []);
  const [previewRect, setPreviewRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  /** Los tres vértices en curso, para pintar el triángulo real —no su caja—
   *  mientras se arrastra. */
  const [previewPuntos, setPreviewPuntos] = useState<[Point2D, Point2D, Point2D] | null>(null);

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
  }, [zoom2D, pan2D]);

  const publish = useCallback(() => {
    const p = pressRef.current;
    if (!p?.moved) { setPreviewRect(null); setPreviewPuntos(null); return; }
    const x = Math.min(p.start.x, p.current.x);
    const y = Math.min(p.start.y, p.current.y);
    const w = Math.abs(p.current.x - p.start.x);
    const h = Math.abs(p.current.y - p.start.y);
    setPreviewRect({ x, y, width: w, height: h });
    setPreviewPuntos(verticesDe(
      barRef.current.figura, x, y, w, h,
      p.current.x >= p.start.x, p.current.y >= p.start.y,
    ));
  }, []);

  const create = useCallback((pts: [Point2D, Point2D, Point2D]) => {
    const id = onComplete({
      name: `Triángulo ${Date.now().toString(36)}`,
      outline: toPath(pts),
      ...draftedPieceDefaults(),
    });
    setHotId(id);
  }, [onComplete]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const pt = toPattern(e);
    pressRef.current = { start: pt, screen: { x: e.clientX, y: e.clientY }, current: pt, moved: false };
    publish();
  }, [toPattern, publish]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const p = pressRef.current;
    if (!p) return;
    if (!p.moved && isDrag(e.clientX - p.screen.x, e.clientY - p.screen.y)) p.moved = true;
    if (!p.moved) return;
    p.current = toPattern(e);
    publish();
  }, [toPattern, publish]);

  const handleMouseUp = useCallback((e?: React.MouseEvent<SVGSVGElement>) => {
    const p = pressRef.current;
    if (!p) return;
    // Solo el botón izquierdo confirma, por lo mismo que el rectángulo: con el
    // izquierdo apretado, el release del derecho llegaba aquí como un release
    // normal y creaba la pieza justo antes de abrirse el menú (e2e, 2026-08-29).
    if (e && e.button !== 0) {
      pushJournal('gesture', 'triangle:release', { outcome: 'ignoredButton', button: e.button });
      return;
    }
    pressRef.current = null;
    // Bitácora: solo las salidas mudas; crear ya es el `project/addPiece`.
    if (!p.moved) {
      const { base, altura, figura } = barRef.current;
      // La caja arranca en el press, igual que el rectángulo: la esquina del
      // press es siempre la superior izquierda de la caja.
      if (base > 0 && altura > 0) create(verticesDe(figura, p.start.x, p.start.y, base, altura, true, true));
      else {
        pushJournal('gesture', 'triangle:release', { outcome: 'tooSmall', base, altura, source: 'bar' });
        noPasoNada('triangulo:medida-en-cero', { base, altura });
      }
    } else {
      const end = e ? toPattern(e) : p.current;
      const w = Math.abs(end.x - p.start.x);
      const h = Math.abs(end.y - p.start.y);
      if (w > 0 && h > 0) {
        const x = Math.min(p.start.x, end.x);
        const y = Math.min(p.start.y, end.y);
        create(verticesDe(barRef.current.figura, x, y, w, h, end.x >= p.start.x, end.y >= p.start.y));
        dispatch(setToolOption({ toolId: 'triangle', optionId: 'base', value: round1(w) }));
        dispatch(setToolOption({ toolId: 'triangle', optionId: 'altura', value: round1(h) }));
      } else {
        pushJournal('gesture', 'triangle:release', { outcome: 'tooSmall', base: round1(w), altura: round1(h), source: 'drag' });
      }
    }
    publish();
  }, [toPattern, create, dispatch, publish]);

  const cancel = useCallback(() => {
    pressRef.current = null;
    publish();
  }, [publish]);

  /** true = la tecla era del gesto y se consumió (solo Escape con press vivo). */
  const handleKeyDown = useCallback((e: KeyboardEvent): boolean => {
    if (e.key === 'Escape' && pressRef.current) { cancel(); return true; }
    return false;
  }, [cancel]);

  const isArmed = useCallback(() => pressRef.current !== null, []);

  const triangleDimensions = previewRect ? {
    width: previewRect.width,
    height: previewRect.height,
    center: { x: previewRect.x + previewRect.width / 2, y: previewRect.y + previewRect.height / 2 },
  } : null;

  return {
    isDragging: previewRect !== null,
    previewRect,
    trianglePoints: previewPuntos,
    triangleDimensions,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    cancel,
    isArmed,
    hotId,
    enfriar,
  };
}
