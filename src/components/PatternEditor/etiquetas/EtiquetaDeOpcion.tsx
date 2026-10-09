import { useEffect, useLayoutEffect, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import type { ToolOption } from '../../../tools/types';
import { usePeldanoDeEscape } from '../../../shortcuts/escaleraDeLoLlamado';
import { pushJournal } from '../../../utils/telemetry/journal';
import { Control } from '../ToolOptionControls';
import './EtiquetaDeOpcion.css';

export type QueLlevaEtiqueta = 'piquete' | 'costura' | 'esquina';

export interface EtiquetaDeOpcionProps {
  /** Qué objeto la lleva. Va a la bitácora. */
  que: QueLlevaEtiqueta;
  /** El valor de ahora, como lo nombra el menú: «Recta · 8 × 3 mm», «Normal», «Inglete». */
  texto: string;
  /** El dibujo del valor, delante del texto: la forma del piquete. */
  Dibujo?: FC<{ size?: number }>;
  /** Nombre accesible del botón, con el valor dentro: «Piquete: Recta · 8 × 3 mm». */
  nombre: string;
  /** Nombre del menú: «Opciones del piquete», «Tipo de costura». */
  nombreDelMenu: string;
  /** Las opciones del objeto, con la forma de las de una herramienta: se pintan con `Control`. */
  opciones: readonly ToolOption[];
  valores: Readonly<Record<string, unknown>>;
  /** Llega con el id de la opción (`shape`), no con el del control (`etiqueta-shape`). */
  alCambiar(opcion: string, valor: unknown): void;
  /** Centro de la pastilla, en px del contenedor `.pattern-editor`. */
  left: number;
  top: number;
  /** Pieza o capa bloqueada: se ve apagada, y el clic avisa en vez de abrir. */
  apagada?: boolean;
  alPulsarApagada?(): void;
}

/**
 * La etiqueta de opción (spec 2026-10-02 «la interfaz en papel» § 5.2):
 * blanca, con línea de pelo, texto en tinta y una flecha, junto al objeto
 * elegido. Al clicarla abre un menú con los MISMOS controles de la línea al
 * pie (`Control`), pero para ese objeto: es el pie de lo que ya está puesto.
 * El menú cuelga de <body>, como «Más», y Esc lo cierra antes que la
 * selección (`usePeldanoDeEscape`).
 */
export default function EtiquetaDeOpcion({
  que, texto, Dibujo, nombre, nombreDelMenu, opciones, valores, alCambiar, left, top, apagada = false, alPulsarApagada,
}: EtiquetaDeOpcionProps) {
  const [abierto, setAbierto] = useState(false);
  const [ancla, setAncla] = useState({ left: 0, top: 0 });
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const deTeclado = useRef(false);

  // Abrir y cerrar quedan en la bitácora. Abierto con el teclado, el foco
  // entra al menú: cuelga de <body>, y Tab desde la pastilla no llegaría. Con
  // el ratón se queda donde estaba, como en «Más».
  const abiertoAntes = useRef(abierto);
  useEffect(() => {
    if (abiertoAntes.current === abierto) return;
    abiertoAntes.current = abierto;
    pushJournal('ui', 'etiqueta', { que, abierto });
    if (abierto && deTeclado.current) {
      menuRef.current?.querySelector<HTMLElement>('button:not([tabindex="-1"]), input, select')?.focus();
    }
  }, [abierto, que]);

  // Debajo de la pastilla; si no cabe, encima. Nunca fuera de la ventana.
  useLayoutEffect(() => {
    const boton = botonRef.current;
    const menu = menuRef.current;
    if (!abierto || !boton || !menu) return;
    const r = boton.getBoundingClientRect();
    const abajo = r.bottom + 4;
    setAncla({
      left: Math.max(16, Math.min(r.left, window.innerWidth - menu.offsetWidth - 16)),
      top: abajo + menu.offsetHeight + 16 <= window.innerHeight ? abajo : Math.max(16, r.top - 4 - menu.offsetHeight),
    });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (botonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setAbierto(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [abierto]);

  usePeldanoDeEscape('etiqueta', 'menu', abierto, () => {
    if (menuRef.current?.contains(document.activeElement)) botonRef.current?.focus();
    setAbierto(false);
  });

  // Con el ratón ningún botón se queda con el foco: Enter y Espacio son del
  // botón solo si se llegó a él con el teclado (contrato § 4, `data-botonera`).
  const noTomarElFoco = (e: { target: EventTarget; preventDefault(): void }) => {
    if ((e.target as Element).closest('button')) e.preventDefault();
  };

  return (
    <span
      className="etiqueta-de-opcion"
      data-superficie="cabina"
      data-material="papel"
      data-botonera
      style={{ left, top }}
      onMouseDown={noTomarElFoco}
    >
      <button
        ref={botonRef}
        type="button"
        className="etiqueta-de-opcion__boton"
        aria-label={nombre}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-disabled={apagada || undefined}
        onClick={(e) => {
          if (apagada) {
            alPulsarApagada?.();
            return;
          }
          // Un clic del teclado (Enter, Espacio) llega con `detail` 0.
          deTeclado.current = e.detail === 0;
          setAbierto((a) => !a);
        }}
      >
        {Dibujo && <Dibujo size={16} />}
        <span className="etiqueta-de-opcion__texto">{texto}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {abierto && createPortal(
        <div
          ref={menuRef}
          className="etiqueta-de-opcion__menu"
          role="group"
          aria-label={nombreDelMenu}
          data-superficie="menu"
          data-material="papel"
          data-shortcut-context="2d"
          data-botonera
          onMouseDown={noTomarElFoco}
          style={{ left: ancla.left, top: ancla.top }}
        >
          {opciones.map((o) => (
            <Control
              key={o.id}
              opcion={{ ...o, id: `etiqueta-${o.id}` }}
              valor={valores[o.id] ?? o.value}
              alCambiar={(v) => {
                pushJournal('gesture', 'etiqueta:cambia', { que, opcion: o.id, valor: v });
                alCambiar(o.id, v);
              }}
            />
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}
