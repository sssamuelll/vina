import { useCallback, useRef, useState } from 'react';
import {
  resolveEdgeCommit,
  type EdgeCommit,
  type EdgeGesturePhase,
  type EdgeTarget,
} from './edgeGesture';
import { isDrag } from './gestureConstants';

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
   *  la mano fijó al arrancar. `null` también cubre cruces fuera del borde. */
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
    if (!target) return;

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
    // Si el cruce ocurrió fuera del borde, esperamos la primera proyección
    // válida. Una vez fijada no se toca: el resto del recorrido puede volver.
    if (a.firstDragT === null && t !== null) a.firstDragT = t;
    setLiveRange(t === null ? null : [Math.min(a.press.t, t), Math.max(a.press.t, t)]);
  }, [resolveReleaseT]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const a = armed.current;
    if (!a) return;
    const t = a.moved ? resolveReleaseT(e, a.press) : null;
    // El mouseup también puede ser la primera proyección válida tras un
    // cruce fuera del borde; solo llena el hueco, nunca reemplaza el arranque.
    if (a.firstDragT === null && t !== null) a.firstDragT = t;
    const commit = resolveEdgeCommit(a.press, t, a.moved, a.firstDragT);
    reset();
    onCommit(commit);
  }, [resolveReleaseT, onCommit, reset]);

  return {
    phase, press, liveRange,
    handleMouseDown, handleMouseMove, handleMouseUp,
    cancel: reset,
    /** ¿Hay un gesto vivo? Lo usa el guard de Escape y el del contextmenu. */
    isArmed: () => armed.current !== null,
  };
}
