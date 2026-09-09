import { useState, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { Point2D, PathCommand, InternalLine } from '../../types/types';
import { screenToPattern } from '../../utils/geometry';
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

/**
 * Rectángulo (spec 2026-08-29 § 6, María #191).
 *
 * El press manda el objeto, el release manda el valor: soltar sin haberse
 * movido crea el rectángulo con el Ancho y el Alto de la barra, esquina
 * superior izquierda en el press — el "clicas con el izquierdo y lo crea" de
 * CLO. Soltar habiéndose movido crea lo dibujado y NO toca la barra
 * (reunión María 07-09): la barra solo cambia si ella la escribe. Decide
 * `isDrag` en píxeles de
 * pantalla; el gate viejo de 5 mm de patrón (que dejaba una banda muerta
 * entre 4 px y 5 mm) murió.
 */
export function useRectangleTool(
  zoom2D: number,
  pan2D: Point2D,
  /** Devuelve el id de la pieza creada: la creación caliente (spec cotas vivas § 3.1) lo necesita. */
  onComplete: (piece: NewPieceData) => string,
) {
  const barWidth = useSelector((s: RootState) => Number(s.tools.toolOptions?.rectangle?.width ?? DEFAULT_MM));
  const barHeight = useSelector((s: RootState) => Number(s.tools.toolOptions?.rectangle?.height ?? DEFAULT_MM));
  const barRef = useRef({ w: barWidth, h: barHeight });
  barRef.current = { w: barWidth, h: barHeight };

  const pressRef = useRef<Press | null>(null);
  /** La pieza que este hook acaba de crear, mientras siga seleccionada y la
   *  herramienta sea Rectángulo. `PatternEditor` la enfría (a null) en cuanto
   *  eso deja de ser cierto, y no vuelve a calentarse sola (spec § 3.1). */
  const [hotId, setHotId] = useState<string | null>(null);
  const enfriar = useCallback(() => setHotId(null), []);
  const [previewRect, setPreviewRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
  }, [zoom2D, pan2D]);

  const publish = useCallback(() => {
    const p = pressRef.current;
    if (!p?.moved) { setPreviewRect(null); return; }
    setPreviewRect({
      x: Math.min(p.start.x, p.current.x),
      y: Math.min(p.start.y, p.current.y),
      width: Math.abs(p.current.x - p.start.x),
      height: Math.abs(p.current.y - p.start.y),
    });
  }, []);

  const create = useCallback((x: number, y: number, w: number, h: number) => {
    const outline: PathCommand[] = [
      { type: 'M', values: [x, y] },
      { type: 'L', values: [x + w, y] },
      { type: 'L', values: [x + w, y + h] },
      { type: 'L', values: [x, y + h] },
      { type: 'Z', values: [] },
    ];
    const id = onComplete({
      name: `Rect ${Date.now().toString(36)}`,
      outline,
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
    // Solo el botón izquierdo confirma. Con el izquierdo apretado, el release
    // del botón derecho llegaba aquí como un release normal y creaba el
    // rectángulo justo antes de que el menú se abriera (e2e, 2026-08-29). El
    // `contextmenu` que sigue es quien cancela el press.
    if (e && e.button !== 0) {
      pushJournal('gesture', 'rectangle:release', { outcome: 'ignoredButton', button: e.button });
      return;
    }
    pressRef.current = null;
    // Bitácora: solo las salidas mudas; crear ya es el `project/addPiece`.
    if (!p.moved) {
      const { w, h } = barRef.current;
      if (w > 0 && h > 0) create(p.start.x, p.start.y, w, h);
      else {
        pushJournal('gesture', 'rectangle:release', { outcome: 'tooSmall', width: w, height: h, source: 'bar' });
        // Ya estaba en la bitácora desde el 08-29; ahora además se dice, que es
        // lo único que María puede ver (#1117).
        noPasoNada('rectangulo:medida-en-cero', { width: w, height: h });
      }
    } else {
      const end = e ? toPattern(e) : p.current;
      const w = Math.abs(end.x - p.start.x);
      const h = Math.abs(end.y - p.start.y);
      if (w > 0 && h > 0) {
        // Dibujar NO reescribe la barra (reunión María 07-09, [01:49]: "en
        // verdad no es una acción repetitiva, cada rectángulo va a ser de un
        // tamaño distinto"). La barra sigue mandando sobre lo que crea un
        // clic, pero solo si ELLA la escribe: se va la ruta implícita, se
        // queda la deliberada. Ella misma cazó la contradicción que esto
        // producía en [01:22]: el rótulo prometía 100 y le creaba otra cosa.
        create(Math.min(p.start.x, end.x), Math.min(p.start.y, end.y), w, h);
      } else {
        pushJournal('gesture', 'rectangle:release', { outcome: 'tooSmall', width: round1(w), height: round1(h), source: 'drag' });
      }
    }
    publish();
  }, [toPattern, create, publish]);

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

  const rectDimensions = previewRect ? {
    width: previewRect.width,
    height: previewRect.height,
    center: { x: previewRect.x + previewRect.width / 2, y: previewRect.y + previewRect.height / 2 },
  } : null;

  return {
    isDragging: previewRect !== null,
    previewRect,
    rectDimensions,
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
