import { useCallback, useRef, useState } from 'react';
import {
  MIN_SEGMENT_T,
  resolveEdgeCommit,
  type EdgeCommit,
  type EdgeGesturePhase,
  type EdgeTarget,
} from './edgeGesture';
import { isDrag } from './gestureConstants';
import { pushJournal } from '../../utils/telemetry/journal';

/**
 * ¿Esta proyección dice ya algún sentido, o sigue encima del press?
 *
 * El umbral de arrastre se mide en PANTALLA, así que un movimiento
 * perpendicular al borde lo cruza sin avanzar nada a lo largo del borde. Su
 * proyección cae sobre el press: no señala ningún lado. Antes de #1061 ese
 * caso ni se planteaba —fuera del radio la proyección era `null`— y al quitar
 * el radio empezó a llegar un cero que el signo leía como "hacia adelante".
 *
 * Medido en piquete: bajar perpendicular, irse a la izquierda y soltar ponía
 * la marca en el lado contrario, a la misma distancia. El espejo exacto.
 */
function separadaDelPress(pressT: number, t: number | null): t is number {
  return t !== null && Math.abs(t - pressT) >= MIN_SEGMENT_T;
}

interface EdgeGestureOptions {
  /** Qué hay bajo el cursor en el press. `null` = no hay objetivo, no se arma. */
  resolveTarget: (e: React.MouseEvent<SVGSVGElement>) => EdgeTarget | null;
  /** El t sobre el MISMO borde del press. `null` = el cursor se salió del borde. */
  resolveReleaseT: (e: React.MouseEvent<SVGSVGElement>, press: EdgeTarget) => number | null;
  onCommit: (commit: EdgeCommit) => void;
}

interface ArmedRef {
  press: EdgeTarget;
  startX: number;
  startY: number;
  moved: boolean;
  /** Sin este recuerdo, devolverse antes de soltar invertiría el sentido que
   *  la mano fijó al arrancar. `null` mientras el recorrido no haya dicho
   *  todavía ningún sentido — ver `separadaDelPress`. */
  firstDragT: number | null;
  /** El elemento que capturó el puntero, para soltarlo al terminar. */
  captured: Element | null;
  pointerId: number | null;
}

/**
 * El gesto de borde, compartido por todas las herramientas que preguntan
 * "cuánto". El press manda el OBJETO y no se re-apunta nunca: mover el cursor
 * a otro borde, a otra pieza o fuera del lienzo no cambia sobre qué se está
 * trabajando, solo dónde a lo largo de él.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 4.1
 */
export function useEdgeGesture(opts: EdgeGestureOptions) {
  const { resolveTarget, resolveReleaseT, onCommit } = opts;
  const armed = useRef<ArmedRef | null>(null);
  const [phase, setPhase] = useState<EdgeGesturePhase>('idle');
  const [press, setPress] = useState<EdgeTarget | null>(null);
  const [liveRange, setLiveRange] = useState<[number, number] | null>(null);

  const reset = useCallback(() => {
    const a = armed.current;
    if (a?.captured && a.pointerId !== null) {
      const el = a.captured as Element & { releasePointerCapture?: (id: number) => void };
      try { el.releasePointerCapture?.(a.pointerId); } catch { /* ya soltado */ }
    }
    armed.current = null;
    setPhase('idle');
    setPress(null);
    setLiveRange(null);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const target = resolveTarget(e);
    // Bitácora: el press que no encuentra borde es mudo para Redux; el que lo
    // encuentra fija el objeto del gesto entero (el commit ya despacha).
    if (!target) {
      pushJournal('gesture', 'edge:miss');
      return;
    }
    pushJournal('gesture', 'edge:press', {
      pieceId: target.pieceId, edgeIndex: target.edgeIndex, t: Math.round(target.t * 1000) / 1000,
    });

    // Captura de puntero: sin esto, soltar fuera del lienzo pierde el mouseup y
    // el gesto se queda armado para siempre.
    const el = e.currentTarget as unknown as {
      setPointerCapture?: (id: number) => void;
    };
    const pointerId = (e as unknown as { pointerId?: number }).pointerId ?? 1;
    let captured: Element | null = null;
    try {
      el.setPointerCapture?.(pointerId);
      captured = e.currentTarget as unknown as Element;
    } catch { /* jsdom o navegador sin soporte: el gesto sigue funcionando */ }

    armed.current = {
      press: target, startX: e.clientX, startY: e.clientY,
      moved: false, firstDragT: null, captured, pointerId,
    };
    setPhase('armed');
    setPress(target);
    setLiveRange(null);
  }, [resolveTarget]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const a = armed.current;
    if (!a) return;

    if (!a.moved && isDrag(e.clientX - a.startX, e.clientY - a.startY)) {
      a.moved = true;
      setPhase('dragging');
    }
    if (!a.moved) return;

    const t = resolveReleaseT(e, a.press);
    // Esperamos la primera proyección que de verdad se haya SEPARADO del press
    // a lo largo del borde. Una vez fijada no se toca: el resto del recorrido
    // puede volver, y el sentido lo manda el arranque.
    if (a.firstDragT === null && separadaDelPress(a.press.t, t)) a.firstDragT = t;
    setLiveRange(t === null ? null : [Math.min(a.press.t, t), Math.max(a.press.t, t)]);
  }, [resolveReleaseT]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const a = armed.current;
    if (!a) return;
    const t = a.moved ? resolveReleaseT(e, a.press) : null;
    // El mouseup también puede ser la primera proyección separada del press,
    // si todo el recorrido anterior fue perpendicular; solo llena el hueco,
    // nunca reemplaza el arranque.
    if (a.firstDragT === null && separadaDelPress(a.press.t, t)) a.firstDragT = t;
    const commit = resolveEdgeCommit(a.press, t, a.moved, a.firstDragT);
    reset();
    onCommit(commit);
  }, [resolveReleaseT, onCommit, reset]);

  // Identidad estable: quien lo ponga en las deps de un efecto no quiere un
  // disparo por render, quiere el ref exacto (5b-3, hover del margen).
  const isArmed = useCallback(() => armed.current !== null, []);

  return {
    phase, press, liveRange,
    handleMouseDown, handleMouseMove, handleMouseUp,
    cancel: reset,
    /** La DISTANCIA necesita el sentido que ya fijó el gesto; exponer el
     *  valor vivo evita volver a deducirlo desde el cursor final. */
    firstDragT: () => armed.current?.firstDragT ?? null,
    /** ¿Hay un gesto vivo? Lo usa el guard de Escape y el del contextmenu. */
    isArmed,
  };
}
