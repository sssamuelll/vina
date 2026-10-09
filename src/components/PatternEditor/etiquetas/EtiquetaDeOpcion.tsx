import { useEffect, useId, useLayoutEffect, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import type { ToolOption } from '../../../tools/types';
import type { Point2D } from '../../../types/types';
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
  /** El ancla de la pastilla, en px del contenedor `.pattern-editor`. */
  left: number;
  top: number;
  /**
   * Hacia dónde se aleja del objeto (unitario). La pastilla crece en esa
   * dirección: su borde cercano se apoya en el ancla, así no tapa lo que
   * describe aunque el objeto esté en un lado vertical. Sin él, centrada.
   */
  hacia?: Point2D;
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
/** Lo que la pastilla guarda del borde de la hoja cuando tiene que correrse (px). */
const MARGEN_HOJA_PX = 8;

/** El `translate` que apoya el borde cercano de la pastilla en su ancla. */
function desplazamiento(hacia: Point2D | undefined): string {
  const eje = (v: number) => Math.round((-50 + v * 50) * 10) / 10;
  return hacia ? `translate(${eje(hacia.x)}%, ${eje(hacia.y)}%)` : 'translate(-50%, -50%)';
}

export default function EtiquetaDeOpcion({
  que, texto, Dibujo, nombre, nombreDelMenu, opciones, valores, alCambiar, left, top, hacia, apagada = false, alPulsarApagada,
}: EtiquetaDeOpcionProps) {
  const [abierto, setAbierto] = useState(false);
  const [ancla, setAncla] = useState({ left: 0, top: 0 });
  const [empujon, setEmpujon] = useState({ x: 0, y: 0 });
  const raizRef = useRef<HTMLSpanElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const deTeclado = useRef(false);
  const menuId = useId();

  // La caja negra ve todo cierre, también el que no pasa por un gesto suyo:
  // otra selección, un deshacer u otra herramienta desmontan la pastilla con
  // el menú abierto (revisión final de P3c).
  const abiertoAlDesmontar = useRef(abierto);
  abiertoAlDesmontar.current = abierto;
  useEffect(() => () => {
    if (abiertoAlDesmontar.current) pushJournal('ui', 'etiqueta', { que, abierto: false, motivo: 'desmontada' });
  }, [que]);

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

  // Dentro de la hoja: con el objeto pegado a su borde, la pastilla se corre lo
  // justo para no salirse (las capturas de P3c la enseñaron cortada). Se mide
  // sin el corrimiento de antes; sin cambio, no vuelve a pintar. jsdom no mide.
  useLayoutEffect(() => {
    const el = raizRef.current;
    const hoja = el?.offsetParent;
    if (!el || !(hoja instanceof HTMLElement)) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const h = hoja.getBoundingClientRect();
    const izq = r.left - empujon.x;
    const der = r.right - empujon.x;
    const arr = r.top - empujon.y;
    const aba = r.bottom - empujon.y;
    const x = izq < h.left + MARGEN_HOJA_PX ? h.left + MARGEN_HOJA_PX - izq
      : der > h.right - MARGEN_HOJA_PX ? h.right - MARGEN_HOJA_PX - der : 0;
    const y = arr < h.top + MARGEN_HOJA_PX ? h.top + MARGEN_HOJA_PX - arr
      : aba > h.bottom - MARGEN_HOJA_PX ? h.bottom - MARGEN_HOJA_PX - aba : 0;
    if (Math.abs(x - empujon.x) > 0.5 || Math.abs(y - empujon.y) > 0.5) setEmpujon({ x, y });
  }, [left, top, hacia?.x, hacia?.y, texto, empujon.x, empujon.y]);

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

  // Si la pieza se bloquea con el menú abierto (un Ctrl+Z del desbloqueo, el
  // candado de la capa), el menú se va: un clic más escribiría sobre ella.
  useEffect(() => {
    if (apagada) setAbierto(false);
  }, [apagada]);

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
      ref={raizRef}
      className="etiqueta-de-opcion"
      data-superficie="cabina"
      data-material="papel"
      data-botonera
      style={{
        left,
        top,
        transform: empujon.x || empujon.y
          ? `${desplazamiento(hacia)} translate(${empujon.x}px, ${empujon.y}px)`
          : desplazamiento(hacia),
      }}
      onMouseDown={noTomarElFoco}
    >
      <button
        ref={botonRef}
        type="button"
        className="etiqueta-de-opcion__boton"
        aria-label={nombre}
        aria-expanded={abierto}
        aria-controls={abierto ? menuId : undefined}
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
          id={menuId}
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
