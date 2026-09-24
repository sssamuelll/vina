import { useCallback, useEffect, useRef } from 'react';
import { isEditableTarget } from '../../utils/editableTarget';
import { hayModalDelante } from '../../utils/superficieModal';
import { SHIFT_DOBLE_MS, SHIFT_TOQUE_MS } from './gestureConstants';

/** Sin Shift, Shift una vez (la hoja) o Shift dos veces (el borde). */
export type ModoShift = 'suelto' | 'hoja' | 'borde';

/**
 * Qué Shift está pulsado AHORA —ninguno, una vez o dos—, y un aviso cuando
 * cambia.
 *
 * El evento del ratón ya trae `shiftKey`, pero solo cuando el ratón se mueve.
 * María pulsa Shift con la mano quieta y espera ver la línea enderezarse en ese
 * momento (10-09 [07:35]: «le estaba dando al shift, pero no me hace nada»):
 * sin escuchar la tecla, Shift parecería roto hasta el siguiente píxel.
 *
 * - El estado sale del MODIFICADOR (`e.shiftKey`), no del tipo de evento:
 *   soltar una Shift con la otra todavía pulsada trae `shiftKey` en `true`.
 * - Las teclas de un campo son del campo, y con un modal delante el lienzo no
 *   escucha: los mismos dos filtros que el router CF-1. Sin ellos, cada
 *   mayúscula escrita en el chat con un trazo a medias movía la goma.
 * - Escucha en `window` y en captura, y nunca consume la tecla: el router
 *   detiene la propagación de lo que consume una herramienta, y Shift no puede
 *   depender de eso.
 * - Perder el foco NO es soltar Shift: el `keyup` no llegará, así que el estado
 *   se olvida sin avisar. Avisar reaplicaba un arrastre de `Q` sin la guía y
 *   el cierre por pérdida de foco lo confirmaba en una posición que nadie vio.
 *
 * Shift dos veces (spec 2026-09-23 § 3.1 y § 3.5): un toque —pulsar y soltar en
 * menos de `SHIFT_TOQUE_MS`, sin ratón entre medias— seguido de otra pulsación
 * antes de `SHIFT_DOBLE_MS` es el BORDE mientras se mantiene. Es la segunda
 * tecla porque es la única que está en todos los teclados sin ser atajo de
 * sistema en ninguno: Alt+Shift y Ctrl+Shift cambian el idioma o el teclado en
 * Windows, y el navegador no los puede interceptar.
 *
 * Los handlers de ratón pasan su `e.shiftKey` por `sincronizar` (en el press y
 * en el movimiento): así teclado y ratón no pueden discrepar, aunque Shift se
 * haya pulsado con la ventana sin foco.
 */
export function useShiftSostenido(alCambiar: (modo: ModoShift) => void) {
  const modoRef = useRef<ModoShift>('suelto');
  const alCambiarRef = useRef(alCambiar);
  alCambiarRef.current = alCambiar;
  // El doble toque: cuándo empezó la pulsación viva (null si no la vio el
  // teclado), si se gastó (un clic u otra tecla mientras estaba pulsada), y
  // cuándo se soltó el último toque.
  const pulsadoEnRef = useRef<number | null>(null);
  const gastadaRef = useRef(false);
  const toqueEnRef = useRef<number | null>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Shift') {
        // Otra tecla con Shift pulsado (Ctrl+Shift+Z, Shift+Tab…) lo gasta: un
        // atajo no es un toque.
        if (e.type === 'keydown' && modoRef.current !== 'suelto') gastadaRef.current = true;
        return;
      }
      const ahora = Date.now();
      const deCampo = isEditableTarget(e.target) || hayModalDelante();
      if (e.shiftKey) {
        // Pulsar: las teclas de un campo son del campo, y con un modal delante
        // el lienzo no escucha.
        if (deCampo) return;
        // Autorrepetición, o la otra Shift con una ya pulsada: es la misma pulsación.
        if (modoRef.current !== 'suelto') return;
        const doble = toqueEnRef.current !== null && ahora - toqueEnRef.current <= SHIFT_DOBLE_MS;
        toqueEnRef.current = null;
        pulsadoEnRef.current = ahora;
        gastadaRef.current = false;
        modoRef.current = doble ? 'borde' : 'hoja';
      } else {
        // Soltar se atiende SIEMPRE. Tab lleva el foco al chip con Shift aún
        // pulsado, y ella lo suelta para escribir: ignorar ese keyup dejaba el
        // modo pegado —con el borde— y la pulsación siguiente parecía
        // autorrepetición. Soltar dentro de un campo, eso sí, no es un toque.
        if (modoRef.current === 'suelto') return;
        const inicio = pulsadoEnRef.current;
        toqueEnRef.current = !deCampo && inicio !== null && !gastadaRef.current && ahora - inicio <= SHIFT_TOQUE_MS
          ? ahora
          : null;
        pulsadoEnRef.current = null;
        modoRef.current = 'suelto';
      }
      alCambiarRef.current(modoRef.current);
    };
    // Un clic con Shift pulsado lo gasta: soltar después ya no es un toque.
    const raton = () => {
      if (modoRef.current !== 'suelto') gastadaRef.current = true;
    };
    const olvidar = () => {
      modoRef.current = 'suelto';
      pulsadoEnRef.current = null;
      toqueEnRef.current = null;
      gastadaRef.current = false;
    };
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('keyup', tecla, true);
    window.addEventListener('mousedown', raton, true);
    window.addEventListener('blur', olvidar);
    return () => {
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('keyup', tecla, true);
      window.removeEventListener('mousedown', raton, true);
      window.removeEventListener('blur', olvidar);
    };
  }, []);

  /**
   * Lo que dice el ratón (`e.shiftKey`) corrige al teclado sin avisar —el
   * handler que llama ya va a pintar—: si Shift no está, suelto; si está y el
   * teclado no lo vio (pulsado con la ventana sin foco), la hoja. El ratón
   * nunca arma el borde: eso solo lo sabe el teclado.
   */
  const sincronizar = useCallback((shiftKey: boolean) => {
    if (!shiftKey) {
      if (modoRef.current !== 'suelto') {
        modoRef.current = 'suelto';
        pulsadoEnRef.current = null;
      }
      return;
    }
    if (modoRef.current === 'suelto') {
      modoRef.current = 'hoja';
      pulsadoEnRef.current = null;
    }
  }, []);

  return { modoRef: modoRef as { readonly current: ModoShift }, sincronizar };
}
