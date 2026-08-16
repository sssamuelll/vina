import { useCallback, useState } from 'react';
import { getPanelSide } from '../components/shell/panelSide';

export interface PanelHost {
  leftPanel: string | null;
  rightPanel: string | null;
  openPanel: (name: string) => void;
  togglePanel: (name: string) => void;
  closePanel: (name: string) => void;
  /** Cierre sin argumentos, identidad estable entre renders — ver H-2 abajo. */
  closeLeft: () => void;
  closeRight: () => void;
}

/**
 * Dos ranuras independientes (izquierda/derecha) en vez de una sola
 * mutuamente excluyente. Resuelve el caso medido en la auditoría del
 * 2026-08-14: Capas (derecha) y Propiedades (izquierda) pueden convivir.
 *
 * Dos operaciones, no una, porque tienen intención distinta:
 * - openPanel: GARANTIZA abierto. La usa la selección en el lienzo
 *   (PatternEditor) — seleccionar un borde y luego otro no debe cerrar
 *   Propiedades a mitad de una edición.
 * - togglePanel: abre si cerrado, cierra si abierto. La usan los botones
 *   (docks, LogoMenu, paleta de comandos) — el comportamiento de hoy.
 */
export function usePanelHost(): PanelHost {
  const [leftPanel, setLeftPanel] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<string | null>(null);

  const openPanel = useCallback((name: string) => {
    if (getPanelSide(name) === 'left') setLeftPanel(name);
    else setRightPanel(name);
  }, []);

  const togglePanel = useCallback((name: string) => {
    if (getPanelSide(name) === 'left') {
      setLeftPanel((prev) => (prev === name ? null : name));
    } else {
      setRightPanel((prev) => (prev === name ? null : name));
    }
  }, []);

  const closePanel = useCallback((name: string) => {
    if (getPanelSide(name) === 'left') {
      setLeftPanel((prev) => (prev === name ? null : prev));
    } else {
      setRightPanel((prev) => (prev === name ? null : prev));
    }
  }, []);

  // H-2: Escape en ContextPanel.tsx registra un keydown propio por
  // instancia; con dos paneles montados, AppShell antes pasaba
  // `onClose={() => closePanel(leftPanel)}` — una flecha en línea que
  // cambia de identidad EN CADA RENDER de AppShell. Eso re-suscribe el
  // efecto de Escape de cada ContextPanel, y si algo vacía la actualización
  // entre los dos listeners de `window` durante el propio despacho del
  // evento (que es justo lo que un runtime puede hacer y un upgrade de
  // React puede voltear en silencio — no es una decisión de diseño),
  // el listener que se quitó a mitad del despacho ya no se invoca. Medido:
  // Escape cerraba siempre el izquierdo, porque su efecto se registra
  // primero.
  //
  // El arreglo es estructural: cierres SIN argumentos, memoizados con
  // dependencias vacías, para que su identidad nunca cambie entre renders
  // de AppShell. Con la identidad estable, ningún re-render (venga cuando
  // venga) re-suscribe el efecto, así que los dos listeners de `window`
  // siguen registrados durante todo el despacho y los dos se ejecutan —
  // Escape cierra los dos paneles, de forma determinista.
  const closeLeft = useCallback(() => setLeftPanel(null), []);
  const closeRight = useCallback(() => setRightPanel(null), []);

  return { leftPanel, rightPanel, openPanel, togglePanel, closePanel, closeLeft, closeRight };
}
