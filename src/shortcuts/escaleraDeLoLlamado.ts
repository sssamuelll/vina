import { useEffect, useRef } from 'react';

/**
 * La escalera de lo que se llama (spec 2026-10-02 «la interfaz en papel»
 * § 6.2): un menú abierto, la barra de IA y un panel se cierran con Esc antes
 * que la selección, y de uno en uno. ShortcutProvider la consulta antes de su
 * atajo global de deseleccionar, así que van antes los gestos del lienzo (en
 * captura) y el borrador de una cota (corta la propagación antes); un modal
 * encima se queda su Esc.
 *
 * No es la escalera de las herramientas del lienzo
 * (`2026-09-06-escalera-de-escape-design.md`): esa es otro trabajo.
 */
export type Prioridad = 'menu' | 'ia' | 'panel';

const PESO: Record<Prioridad, number> = { menu: 3, ia: 2, panel: 1 };

interface Peldano {
  nombre: string;
  prioridad: Prioridad;
  alEscape: () => void;
}

const peldanos: Peldano[] = [];

/** Sube un peldaño. Devuelve la función que lo baja. */
export function subirPeldano(nombre: string, prioridad: Prioridad, alEscape: () => void): () => void {
  const peldano = { nombre, prioridad, alEscape };
  peldanos.push(peldano);
  return () => {
    const i = peldanos.indexOf(peldano);
    if (i >= 0) peldanos.splice(i, 1);
  };
}

/**
 * Un Escape, un peldaño: responde el de más prioridad y, a igual prioridad, el
 * último que se abrió. Devuelve su nombre, o `null` si no hay ninguno.
 */
export function bajarLaEscalera(): string | null {
  let elegido: Peldano | null = null;
  for (const p of peldanos) {
    if (!elegido || PESO[p.prioridad] >= PESO[elegido.prioridad]) elegido = p;
  }
  if (!elegido) return null;
  elegido.alEscape();
  return elegido.nombre;
}

/** El peldaño de una superficie, mientras está `activo`. `alEscape` se lee por ref. */
export function usePeldanoDeEscape(nombre: string, prioridad: Prioridad, activo: boolean, alEscape: () => void): void {
  const ref = useRef(alEscape);
  ref.current = alEscape;
  useEffect(() => {
    if (!activo) return;
    return subirPeldano(nombre, prioridad, () => ref.current());
  }, [nombre, prioridad, activo]);
}
