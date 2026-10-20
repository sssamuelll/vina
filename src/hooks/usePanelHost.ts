import { useCallback, useEffect, useRef, useState } from 'react';
import { usePeldanoDeEscape } from '../shortcuts/escaleraDeLoLlamado';
import { pushJournal } from '../utils/telemetry/journal';

/** Desde este ancho de ventana caben dos paneles, uno junto al otro (spec 2026-10-02 § 6.1). */
export const ANCHO_PARA_DOS_RANURAS = 1600;

export function ranurasPara(anchoDeVentana: number): number {
  return anchoDeVentana >= ANCHO_PARA_DOS_RANURAS ? 2 : 1;
}

/**
 * Los paneles después de pedir `nombre`. Si ya está, nada cambia. Si cabe, se
 * suma a la izquierda de los que hay. Si no, reemplaza al último que se abrió:
 * el primero, pegado al borde de la ventana, no se mueve.
 */
export function conElPanel(paneles: readonly string[], nombre: string, ranuras: number): string[] {
  if (paneles.includes(nombre)) return [...paneles];
  return [...paneles.slice(0, ranuras - 1), nombre];
}

export interface PanelHost {
  /** Los paneles abiertos: el primero, pegado al borde derecho de la ventana; el segundo, a su izquierda. */
  paneles: string[];
  /** GARANTIZA abierto: la barrita de la pieza y el menú del clic derecho. */
  openPanel: (name: string) => void;
  /** Abre si está cerrado y cierra si está abierto: los docks, el menú Vina y los comandos. */
  togglePanel: (name: string) => void;
  closePanel: (name: string) => void;
}

/**
 * Los paneles del marco (spec 2026-10-02 § 6.1): se piden y se abren a la
 * derecha. Por debajo de 1600 px hay una ranura, y el panel que se pide
 * reemplaza al que estaba; a partir de 1600, dos. Nada los abre solo:
 * Propiedades dejó de abrirse al elegir una esquina del margen en P3c, así
 * que el panel de calco ya no se cierra mientras María dibuja (el caso por el
 * que hasta P4 había una ranura a cada lado).
 */
export function usePanelHost(): PanelHost {
  const [paneles, setPaneles] = useState<string[]>([]);
  const [ranuras, setRanuras] = useState(() => ranurasPara(window.innerWidth));

  // Al estrechar la ventana por debajo de 1600 se queda el último que se abrió.
  useEffect(() => {
    const alCambiarDeAncho = () => {
      const n = ranurasPara(window.innerWidth);
      setRanuras(n);
      setPaneles((p) => (p.length > n ? p.slice(-n) : p));
    };
    window.addEventListener('resize', alCambiarDeAncho);
    return () => window.removeEventListener('resize', alCambiarDeAncho);
  }, []);

  const openPanel = useCallback((name: string) => {
    setPaneles((p) => conElPanel(p, name, ranuras));
  }, [ranuras]);

  const togglePanel = useCallback((name: string) => {
    setPaneles((p) => (p.includes(name) ? p.filter((n) => n !== name) : conElPanel(p, name, ranuras)));
  }, [ranuras]);

  const closePanel = useCallback((name: string) => {
    setPaneles((p) => p.filter((n) => n !== name));
  }, []);

  // La caja negra ve cada panel que se abre y cada uno que se cierra, también
  // el que se va porque otro ocupó su ranura: los dos llegan juntos.
  const antes = useRef<string[]>([]);
  useEffect(() => {
    for (const n of paneles) if (!antes.current.includes(n)) pushJournal('ui', 'panel', { panel: n, abierto: true });
    for (const n of antes.current) if (!paneles.includes(n)) pushJournal('ui', 'panel', { panel: n, abierto: false });
    antes.current = paneles;
  }, [paneles]);

  // Esc cierra los paneles antes que la selección, todos a la vez: un peldaño
  // de la escalera de lo que se llama (spec 2026-10-02 § 6.2).
  usePeldanoDeEscape('paneles', 'panel', paneles.length > 0, () => setPaneles([]));

  return { paneles, openPanel, togglePanel, closePanel };
}
