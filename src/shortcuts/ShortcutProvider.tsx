/**
 * ShortcutProvider — React context provider with a single document keydown listener.
 *
 * Determines the active context based on which panel has focus,
 * resolves key events to matching actions, and calls registered handlers.
 *
 * Wrap your app with <ShortcutProvider> to enable centralized shortcut handling.
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { ShortcutRegistry, type ShortcutContext as ShortcutCtx } from './ShortcutRegistry';
import { DEFAULT_SHORTCUTS } from './defaults';
import { ShortcutContext } from './ShortcutContext';
import { pushJournal } from '../utils/telemetry/journal';
import { hayModalDelante } from '../utils/superficieModal';
import { esTeclaDeBotonera } from './teclaDeBotonera';

/** Determine which panel has focus based on the active element */
function getActiveContext(): ShortcutCtx[] {
  const active = document.activeElement;
  const contexts: ShortcutCtx[] = ['global'];

  if (!active || active === document.body) {
    // No specific focus — global + both panels
    contexts.push('2d', '3d');
    return contexts;
  }

  // Check if the active element is inside a specific panel
  const el = active as HTMLElement;
  if (el.closest('[data-shortcut-context="2d"]') || el.closest('.pattern-editor')) {
    contexts.push('2d');
  } else if (el.closest('[data-shortcut-context="3d"]') || el.closest('.viewport-3d')) {
    contexts.push('3d');
  } else if (el.closest('[data-shortcut-context="copilot"]') || el.closest('.copilot-panel')) {
    contexts.push('copilot');
  } else {
    // Unknown focus — allow both 2d and 3d
    contexts.push('2d', '3d');
  }

  return contexts;
}

interface ShortcutProviderProps {
  children: React.ReactNode;
}

export function ShortcutProvider({ children }: ShortcutProviderProps) {
  const registry = useMemo(() => new ShortcutRegistry(DEFAULT_SHORTCUTS), []);
  const registryRef = useRef(registry);
  registryRef.current = registry;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape es la excepcion de todo lo de abajo: sin el, una superficie
      // que se queda las teclas encierra a la usuaria dentro de ella.
      if (e.key !== 'Escape') {
        // Las teclas nacidas en un campo son del campo. Los desplegables
        // incluidos: una letra con el foco dentro busca opcion, no
        // herramienta.
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement
        ) {
          return;
        }

        // Y Enter y Espacio sobre un botón de la línea al pie, que son su
        // pulsación: Espacio no es la simulación con el foco en una
        // alternativa.
        if (esTeclaDeBotonera(e)) return;

        // Y un modal tapa MAS que un campo, no menos (#1173). `edit.delete`
        // es de contexto `global`, asi que sin esto Supr se llevaba la pieza
        // de detras mientras Maria leia la pregunta --y el dialogo se quedaba
        // abierto preguntando por algo que ya no existia.
        //
        // El detector es el del estandar y no una marca nuestra: `aria-modal`
        // dice exactamente «esto bloquea lo de atras». Y deja fuera, a
        // proposito, a los dialogos NO modales, que es justo lo que hay que
        // dejar fuera: `NotchPrecisionModal` es `role="dialog"` SIN velo, se
        // abre junto a la pieza y el lienzo sigue vivo detras. Un detector
        // por `role` lo habria apagado con los demas.
        if (hayModalDelante()) {
          // Retirarse no es soltarle la tecla al NAVEGADOR: sin esto, Ctrl+R
          // detrás de un diálogo destructivo recarga la app entera y Ctrl+A
          // selecciona el texto de la página. Si era un atajo nuestro CON
          // ctrl/meta, se suprime: no es de Vina, pero tampoco del navegador.
          //
          // Y solo con ctrl/meta. Suprimir además las teclas sueltas rompe el
          // control que tiene el foco dentro del diálogo: Espacio sobre el
          // botón es su activación, y `sim.toggle` vive en Espacio. Eso fue
          // un rojo medido al generalizarlo.
          if ((e.ctrlKey || e.metaKey) && registryRef.current.matchEvent(e, getActiveContext())) {
            e.preventDefault();
          }
          return;
        }
      }

      const activeContexts = getActiveContext();
      const actionId = registryRef.current.matchEvent(e, activeContexts);

      if (actionId) {
        const actionHandler = registryRef.current.getHandler(actionId);
        // Bitácora: el atajo que se disparó, y si alguien lo atendió. Un match
        // sin handler era silencio (spec caja-negra § 3.4).
        pushJournal('shortcut', actionId, {
          key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey,
          handled: !!actionHandler,
        });
        if (actionHandler) {
          e.preventDefault();
          actionHandler();
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <ShortcutContext.Provider value={registry}>
      {children}
    </ShortcutContext.Provider>
  );
}
