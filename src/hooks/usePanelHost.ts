import { useCallback, useState } from 'react';
import { getPanelSide } from '../components/shell/panelSide';

export interface PanelHost {
  leftPanel: string | null;
  rightPanel: string | null;
  openPanel: (name: string) => void;
  togglePanel: (name: string) => void;
  closePanel: (name: string) => void;
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

  return { leftPanel, rightPanel, openPanel, togglePanel, closePanel };
}
