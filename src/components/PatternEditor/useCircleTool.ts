import { useState, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { Point2D, PathCommand, InternalLine } from '../../types/types';
import { screenToPattern, ellipseToPath } from '../../utils/geometry';
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

/** El mismo `value` que declara la opción Radio en `tools/definitions/circle.tsx`. */
const DEFAULT_RADIO_MM = 50;
const round1 = (v: number) => Math.round(v * 10) / 10;

/** La elipse inscrita en la caja que va del press al cursor. */
function inscrita(a: Point2D, b: Point2D, figura: string) {
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  // Un círculo tiene un solo radio: se toma el MENOR de los dos semiejes para
  // que la figura quepa entera en lo arrastrado en vez de desbordarlo.
  const menor = Math.min(w, h) / 2;
  return {
    cx: Math.min(a.x, b.x) + w / 2,
    cy: Math.min(a.y, b.y) + h / 2,
    rx: figura === 'circle' ? menor : w / 2,
    ry: figura === 'circle' ? menor : h / 2,
  };
}

/**
 * Círculo y elipse (#1111, María en el audio del 30-08: «círculo es
 * indispensable»).
 *
 * Copia estructural de `useRectangleTool`, a propósito: dos herramientas de
 * dibujo hermanas con dos gramáticas distintas es la deriva que la revisión del
 * 04-09 midió. El press manda el objeto y el release manda el valor — soltar sin
 * haberse movido crea con el Radio de la barra (esquina de la caja en el press,
 * como el rectángulo), y soltar habiéndose movido crea lo dibujado sin tocar
 * la barra (reunión María 07-09). La figura se INSCRIBE en la caja arrastrada; no se dibuja desde
 * el centro.
 *
 * Lo único que no es calco es `create()`: en vez del contorno de cuatro `L`,
 * `ellipseToPath` — cuatro cúbicas, nunca el comando `A` (el 3D lo descarta en
 * silencio; ver `utils/geometry/ellipse.ts`).
 */
export function useCircleTool(
  zoom2D: number,
  pan2D: Point2D,
  /** Devuelve el id de la pieza creada: la creación caliente (spec cotas vivas § 3.1) lo necesita. */
  onComplete: (piece: NewPieceData) => string,
) {
  const barRadius = useSelector((s: RootState) => Number(s.tools.toolOptions?.circle?.radius ?? DEFAULT_RADIO_MM));
  const barShape = useSelector((s: RootState) => String(s.tools.toolOptions?.circle?.shapeType ?? 'circle'));
  const barRef = useRef({ r: barRadius, figura: barShape });
  barRef.current = { r: barRadius, figura: barShape };

  const pressRef = useRef<Press | null>(null);
  /** La pieza que este hook acaba de crear, mientras siga seleccionada y la
   *  herramienta sea Círculo. `PatternEditor` la enfría (a null) en cuanto eso
   *  deja de ser cierto, y no vuelve a calentarse sola (spec § 3.1). */
  const [hotId, setHotId] = useState<string | null>(null);
  const enfriar = useCallback(() => setHotId(null), []);
  /** La CAJA de la elipse en curso, no la del arrastre: con Círculo las dos se
   *  separan en cuanto el gesto no es cuadrado, y lo que se enseña tiene que ser
   *  la pieza que va a nacer. */
  const [previewRect, setPreviewRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
  }, [zoom2D, pan2D]);

  const publish = useCallback(() => {
    const p = pressRef.current;
    if (!p?.moved) { setPreviewRect(null); return; }
    const { cx, cy, rx, ry } = inscrita(p.start, p.current, barRef.current.figura);
    setPreviewRect({ x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 });
  }, []);

  const create = useCallback((cx: number, cy: number, rx: number, ry: number) => {
    // El nombre sale de lo que SALIÓ, no de lo que la cabina tenía puesta. En
    // modo Elipse, un clic sin arrastrar produce un círculo perfecto —la barra
    // tiene un solo número, el Radio— y bautizarlo «Elipse» dejaba ruido en la
    // lista de piezas. Un arrastre cuadrado tenía el mismo problema al revés.
    const nombre = Math.abs(rx - ry) < 1e-6 ? 'Círculo' : 'Elipse';
    const id = onComplete({
      name: `${nombre} ${Date.now().toString(36)}`,
      outline: ellipseToPath(cx, cy, rx, ry),
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
      pushJournal('gesture', 'circle:release', { outcome: 'ignoredButton', button: e.button });
      return;
    }
    pressRef.current = null;
    // Bitácora: solo las salidas mudas; crear ya es el `project/addPiece`.
    if (!p.moved) {
      const { r } = barRef.current;
      // La caja de la figura arranca en el press, igual que la del rectángulo:
      // el centro cae a un radio de la esquina.
      if (r > 0) create(p.start.x + r, p.start.y + r, r, r);
      else {
        pushJournal('gesture', 'circle:release', { outcome: 'tooSmall', radius: r, source: 'bar' });
        noPasoNada('circulo:medida-en-cero', { radius: r });
      }
    } else {
      const end = e ? toPattern(e) : p.current;
      const { cx, cy, rx, ry } = inscrita(p.start, end, barRef.current.figura);
      if (rx > 0 && ry > 0) {
        // Dibujar NO reescribe el Radio de la barra: mismo acuerdo que en el
        // rectángulo (reunión María 07-09). El círculo no salió en esa sesión,
        // pero comparte el mecanismo, y arreglar solo el hermano que ella
        // nombró dejaría los otros dos rotos igual.
        create(cx, cy, rx, ry);
      } else {
        pushJournal('gesture', 'circle:release', { outcome: 'tooSmall', rx: round1(rx), ry: round1(ry), source: 'drag' });
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

  const circleDimensions = previewRect ? {
    width: previewRect.width,
    height: previewRect.height,
    center: { x: previewRect.x + previewRect.width / 2, y: previewRect.y + previewRect.height / 2 },
  } : null;

  return {
    isDragging: previewRect !== null,
    previewRect,
    circleDimensions,
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
