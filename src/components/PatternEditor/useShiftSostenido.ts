import { useEffect, useRef } from 'react';
import { isEditableTarget } from '../../utils/editableTarget';
import { hayModalDelante } from '../../utils/superficieModal';

/**
 * Si Shift está pulsado AHORA, y un aviso cuando cambia.
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
 * Los handlers de ratón escriben el ref con `e.shiftKey` (en el press y en el
 * movimiento): así teclado y ratón no pueden discrepar, aunque Shift se haya
 * pulsado con la ventana sin foco.
 */
export function useShiftSostenido(alCambiar: (sostenido: boolean) => void) {
  const sostenidoRef = useRef(false);
  const alCambiarRef = useRef(alCambiar);
  alCambiarRef.current = alCambiar;

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || isEditableTarget(e.target) || hayModalDelante()) return;
      if (sostenidoRef.current === e.shiftKey) return;
      sostenidoRef.current = e.shiftKey;
      alCambiarRef.current(e.shiftKey);
    };
    const olvidar = () => { sostenidoRef.current = false; };
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('keyup', tecla, true);
    window.addEventListener('blur', olvidar);
    return () => {
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('keyup', tecla, true);
      window.removeEventListener('blur', olvidar);
    };
  }, []);

  return sostenidoRef;
}
