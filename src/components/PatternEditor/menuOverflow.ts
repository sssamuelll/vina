export interface ScrollMeasure {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export interface ScrollFade {
  top: boolean;
  bottom: boolean;
}

export function computeScrollFade(m: ScrollMeasure): ScrollFade {
  return {
    top: m.scrollTop > 1,
    bottom: m.scrollTop + m.clientHeight < m.scrollHeight - 1,
  };
}

export interface EncajeSubmenu {
  /** Borde superior del submenú, en px de viewport, tal como lo pone el CSS. */
  topPx: number;
  innerHeight: number;
  /** Aire hasta el pie de la ventana más el padding del marco. */
  aire: number;
  /** Alto por debajo del cual el submenú deja de ser usable. */
  minimo: number;
}

export interface Encaje {
  /** `max-height` del contenedor que scrollea. */
  altoMax: number;
  /** Cuánto hay que subir el submenú para que ese alto quepa. 0 casi siempre. */
  subir: number;
}

/**
 * Cuánto alto le cabe a un submenú que cuelga de su ítem, y cuánto hay que
 * subirlo si ese alto no cabe donde nació.
 *
 * Sale de una revisión adversarial del arreglo de F3 (2026-09-04). La primera
 * versión era `Math.max(96, innerHeight - top - aire)` escrito en línea: un
 * piso mágico que, en cuanto el ítem que abre el submenú queda a menos de
 * ~120 px del pie de la ventana, **devuelve exactamente el defecto que F3
 * arregló** — el submenú vuelve a salirse, sin scroll que lo salve. Con los
 * siete ítems de hoy no se dispara; es una trampa esperando a que el menú
 * crezca o a que alguien achique la ventana.
 *
 * La salida correcta no es desbordar ni encoger hasta lo inútil: es **subir el
 * submenú**. Un menú flotante puede colgar hacia arriba; lo que no puede es
 * salirse de la pantalla.
 */
export function encajarSubmenu({ topPx, innerHeight, aire, minimo }: EncajeSubmenu): Encaje {
  const espacio = innerHeight - topPx - aire;
  if (espacio >= minimo) return { altoMax: Math.max(0, espacio), subir: 0 };

  // No cabe: se sube lo justo, y nunca más allá del borde de arriba.
  const subir = Math.min(minimo - espacio, Math.max(0, topPx - aire));
  return { altoMax: Math.max(0, espacio + subir), subir };
}
