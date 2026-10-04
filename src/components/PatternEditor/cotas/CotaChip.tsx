import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Cota } from './cotas';
import type { Point2D } from '../../../types/types';
import { parseMedida, formatMedida } from './parseMedida';
import { chipScreenPosition, separarChips, type Estorbo } from './cotasGeometry';
import { GruposDeCotas, type GrupoPuesto } from './gruposDeCotas';
import { DRAG_THRESHOLD_PX } from '../gestureConstants';
import './cotas.css';

export interface CotaChipProps {
  cota: Cota;
  /** Px de pantalla, ya calculados por la capa (centro del chip). */
  left: number;
  top: number;
  zoom2D: number;
  disabled?: boolean;
  onCommit: (cota: Cota, valueMm: number, motivo: 'enter' | 'tab') => void;
  onScrubStart: (cota: Cota) => void;
  onScrub: (cota: Cota, valueMm: number) => void;
  onScrubEnd: (cota: Cota, valueMm: number) => void;
  /** El scrub se cancela (pointercancel, desmontaje): la pieza vuelve al valor de partida, sin clic fantasma. */
  onScrubCancel: (cota: Cota) => void;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const acota = (v: number, c: Cota) => Math.min(c.max, Math.max(c.min, v));
/** El valor como lo escribiría ella: coma decimal, sin unidad. */
const aTexto = (v: number) => String(round1(v)).replace('.', ',');
const referenciaVisible = (cota: Cota) =>
  cota.unit === 'deg' && cota.referenceLabel ? ' ' + cota.referenceLabel : '';
const textoVisible = (cota: Cota) =>
  formatMedida(cota.valueMm, cota.unit, cota.referenceLabel);
/** Una sola escala de modificadores para scrub y flechas: Shift grueso, Alt fino (Figma). */
const ganancia = (e: { shiftKey: boolean; altKey: boolean }) => (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);

/**
 * La agrupación pertenece a la presentación: los dos descriptores siguen
 * alimentando sus escritores y las líneas SVG. El contexto permite que la
 * capa existente conserve su entrada y sus puertas de foco, mientras cada
 * tramo ocupa una sola caja HTML. La separación se calcula con el texto de
 * AMBAS magnitudes; medir solo el largo dejaría el ángulo encima de otro chip.
 */
export function AgruparCotas({ cotas, pan2D, zoom2D, estorbos, children }: {
  cotas: Cota[];
  pan2D: Point2D;
  zoom2D: number;
  estorbos?: readonly Estorbo[];
  children: ReactNode;
}) {
  const puestos = useMemo(() => {
    if (!cotas.some(cota => cota.grupo)) return null;
    const grupos = new Map<string, Cota[]>();
    for (const cota of cotas) {
      const id = cota.grupo ?? cota.id;
      const grupo = grupos.get(id);
      if (grupo) grupo.push(cota);
      else grupos.set(id, [cota]);
    }
    const items = Array.from(grupos.values()).map(campos => {
      const cota = campos[0];
      return {
        cota,
        campos,
        ...(campos.length > 1 ? {
          left: pan2D.x + (cota.a.x + cota.b.x) / 2 * zoom2D,
          top: pan2D.y + (cota.a.y + cota.b.y) / 2 * zoom2D,
        } : chipScreenPosition(cota, pan2D, zoom2D)),
        texto: campos.map(textoVisible).join(' · '),
      };
    });
    const posiciones = separarChips(items, estorbos);
    const resultado = new Map<string, GrupoPuesto | null>();
    items.forEach((item, i) => {
      resultado.set(item.cota.id, { campos: item.campos, ...posiciones[i] });
      for (const campo of item.campos.slice(1)) resultado.set(campo.id, null);
    });
    return resultado;
  }, [cotas, pan2D, zoom2D, estorbos]);
  return <GruposDeCotas.Provider value={puestos}>{children}</GruposDeCotas.Provider>;
}

export default function CotaChip(props: CotaChipProps) {
  const grupo = useContext(GruposDeCotas)?.get(props.cota.id);
  if (grupo === null) return null;
  return <ChipEditable {...props} {...grupo} campos={grupo?.campos ?? [props.cota]} />;
}

/** Los chips de la capa, en orden del DOM: es el orden del Tab. */
function chipsHermanos(el: HTMLElement | null): HTMLElement[] {
  const capa = el?.closest('.cotas');
  return capa ? Array.from(capa.querySelectorAll<HTMLElement>('button.cota:not([aria-disabled="true"])')) : [];
}

/**
 * Un chip de cota (spec 2026-08-30 § 5.3): en reposo es un botón — clic →
 * edición; arrastre ≥ 4 px → scrub con el puntero capturado —; en edición es
 * uno o dos campos de texto. Solo Enter y Tab confirman; Escape y el blur descartan
 * (la selección cambia en mousedown, antes del blur: confirmar ahí sería una
 * carrera). En un tramo, Tab confirma Largo y pasa a Ángulo dentro de la misma
 * caja; Shift+Tab recorre el camino inverso. Solo al salir de sus campos se
 * pasa al chip vecino. Cambiar de campo con el ratón confirma primero el
 * borrador anterior; si es inválido, el foco no sale.
 * Tab mueve el foco al chip vecino por su cuenta, porque el input
 * se desmonta en el mismo tick y la navegación nativa perdería el punto de
 * partida. Nada de `type="number"`: la rueda no cambia el valor y la coma
 * decimal entra. Las teclas del campo detienen la propagación — CF-1 ya
 * ignora targets editables; esto es el cinturón.
 */
function ChipEditable({
  cota, campos, left, top, zoom2D, disabled = false, onCommit, onScrubStart, onScrub, onScrubEnd, onScrubCancel,
}: CotaChipProps & { campos: Cota[] }) {
  const [editing, setEditing] = useState(false);
  const [activo, setActivo] = useState(0);
  const campoActivo = campos[activo];
  const agrupado = campos.length > 1;
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const scrub = useRef<{ cota: Cota; x0: number; v0: number; moved: boolean; last: number } | null>(null);
  const skipClick = useRef(false);
  const campoPulsado = useRef<number | null>(null);
  /** Qué enfocar al volver a reposo: el propio botón, o el chip vecino (Tab). */
  const focoAlCerrar = useRef<'boton' | 'siguiente' | 'anterior' | null>(null);
  /** Cerrado por tecla: el blur que pueda seguir no hace nada. */
  const cerrado = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    const destino = focoAlCerrar.current;
    focoAlCerrar.current = null;
    if (!destino) return;
    const boton = buttonRef.current;
    if (destino === 'boton' || !boton) { boton?.focus(); return; }
    const hermanos = chipsHermanos(boton);
    const i = hermanos.indexOf(boton);
    const vecino = hermanos[i + (destino === 'siguiente' ? 1 : -1)];
    if (!vecino) {
      // Borde del grupo: hacia adelante sale a la línea al pie (el siguiente
      // control de la herramienta); hacia atrás se queda en el botón. Sin esto
      // Tab se comía un paso. Restar y Sumar no cuentan: no están en el orden
      // del teclado.
      const fuera = destino === 'siguiente'
        ? document.querySelector<HTMLElement>('.seccion-del-patron input, .seccion-del-patron select, .seccion-del-patron button:not([tabindex="-1"])')
        : null;
      (fuera ?? boton).focus();
      return;
    }
    // Al retroceder se entra por el último campo del chip anterior; abrir
    // siempre el primero saltaría Ángulo en las líneas con varios tramos.
    vecino.focus();
    const entrada = destino === 'anterior'
      ? vecino.querySelector<HTMLElement>('[data-campo]:last-child') ?? vecino
      : vecino;
    entrada.click();
  }, [editing, activo]);

  // Un scrub que se queda sin puntero (cancel, captura perdida, desmontaje)
  // termina con el valor de partida: nunca queda un batch abierto.
  useEffect(() => () => {
    const s = scrub.current;
    scrub.current = null;
    if (s?.moved) onScrubCancel(s.cota);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elegirCampo = (indice: number) => {
    setActivo(indice);
    setDraft(aTexto(campos[indice].valueMm));
    setDirty(false);
    setInvalid(false);
  };
  const abrir = (indice: number) => {
    if (disabled) return;
    elegirCampo(indice);
    cerrado.current = false;
    setEditing(true);
  };
  const cerrar = (foco: 'boton' | 'siguiente' | 'anterior' | null) => {
    cerrado.current = true;
    focoAlCerrar.current = foco;
    setEditing(false);
  };
  const parsea = (): number | null => {
    // Lo ESCRITO se redondea a un decimal, igual que el chip lo pinta
    // (`aTexto`/flechas ya lo hacían) — si no, el número guardado y el que
    // se lee quedan a un decimal de distancia. Sin editar (`dirty === false`)
    // conserva el valor interno exacto: eso no cambia.
    const crudo = dirty ? parseMedida(draft) : campoActivo.valueMm;
    const v = dirty && crudo !== null ? round1(crudo) : crudo;
    return v !== null && v >= campoActivo.min && v <= campoActivo.max ? v : null;
  };
  /**
   * `motivo` existe por #1129. Para una cota de un objeto Enter y Tab son lo
   * mismo —los dos confirman—, pero los chips agrupados necesitan distinguir
   * recorrer otro campo con Tab de terminar esta edición con Enter.
   */
  const confirmar = (motivo: 'enter' | 'tab'): boolean => {
    const v = parsea();
    if (v === null) {
      setInvalid(true);
      return false;
    }
    if (v !== campoActivo.valueMm || campoActivo.confirmaSinCambio) onCommit(campoActivo, v, motivo);
    return true;
  };
  const cambiarCampo = (indice: number): boolean => {
    if (indice === activo) return true;
    if (!confirmar('tab')) {
      inputRef.current?.focus();
      return false;
    }
    elegirCampo(indice);
    return true;
  };
  const terminarScrub = (valor: (s: { v0: number; last: number }) => number) => {
    const s = scrub.current;
    scrub.current = null;
    if (s?.moved) {
      skipClick.current = true;
      onScrubEnd(s.cota, valor(s));
    }
  };
  // Cancelar no es soltar: no hay clic después que tragar, y el valor vuelve al de partida.
  const cancelarScrub = () => {
    campoPulsado.current = null;
    const s = scrub.current;
    scrub.current = null;
    if (s?.moved) onScrubCancel(s.cota);
  };

  if (editing) {
    const input = (campo: Cota, indice: number) => (
      <input
        ref={indice === activo ? inputRef : undefined}
        type="text"
        inputMode="decimal"
        className={`${agrupado || referenciaVisible(campo) ? '' : 'cota '}cota--editando${invalid && indice === activo ? ' cota--invalida' : ''}`}
        style={agrupado || referenciaVisible(campo) ? undefined : { left, top }}
        aria-label={campo.label}
        aria-invalid={(invalid && indice === activo) || undefined}
        data-rotulo={cota.rotulo}
        data-lado={cota.outward.y > 0 ? 'abajo' : undefined}
        value={indice === activo ? draft : aTexto(campo.valueMm)}
        onMouseDown={(e) => {
          if (indice === activo) return;
          e.preventDefault();
          cambiarCampo(indice);
        }}
        onFocus={() => { if (indice !== activo) cambiarCampo(indice); }}
        onChange={(e) => { setDraft(e.target.value); setDirty(true); setInvalid(false); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            if (confirmar('enter')) cerrar('boton');
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cerrar('boton');
          } else if (e.key === 'Tab') {
            e.preventDefault();
            if (confirmar('tab')) {
              const siguiente = activo + (e.shiftKey ? -1 : 1);
              if (siguiente >= 0 && siguiente < campos.length) elegirCampo(siguiente);
              else cerrar(e.shiftKey ? 'anterior' : 'siguiente');
            }
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = parseMedida(draft) ?? campoActivo.valueMm;
            const paso = ganancia(e) * (e.key === 'ArrowUp' ? 1 : -1);
            setDraft(aTexto(acota(base + paso, campoActivo)));
            setDirty(true);
            setInvalid(false);
          }
        }}
        onBlur={(e) => {
          if (!cerrado.current && !editorRef.current?.contains(e.relatedTarget)) cerrar(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
    );
    if (!agrupado) {
      const unico = input(cota, 0);
      if (!referenciaVisible(cota)) return unico;
      return (
        <div
          ref={editorRef} className="cota cota--grupo cota--grupo-editando" data-superficie="cabina" style={{ left, top }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <label className="cota-campo">
            {unico}
            <span>{'°' + referenciaVisible(cota)}</span>
          </label>
        </div>
      );
    }
    return (
      <div
        ref={editorRef} className="cota cota--grupo cota--grupo-editando" data-superficie="cabina" style={{ left, top }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {campos.map((campo, indice) => (
          <label key={campo.id} className="cota-campo">
            <span>{campo.label}</span>
            {input(campo, indice)}
            <span>{campo.unit === 'mm' ? 'mm' : '°' + referenciaVisible(campo)}</span>
          </label>
        ))}
        {cota.grupo === 'tramo-en-curso' && (
          <span className="cota-grupo-pista">Tab para continuar · Enter para trazar</span>
        )}
      </div>
    );
  }

  const indiceEn = (target: EventTarget) => {
    const indice = target instanceof Element ? target.closest<HTMLElement>('[data-campo]')?.dataset.campo : undefined;
    return indice === undefined ? 0 : Number(indice);
  };
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`cota${cota.primary ? '' : ' cota--hueca'}${cota.scrub === false ? ' cota--sin-scrub' : ''}`}
      data-superficie="cabina"
      style={{ left, top }}
      aria-label={campos.map(campo => campo.label + ': ' + textoVisible(campo)).join(' · ')}
      aria-disabled={disabled || undefined}
      data-rotulo={cota.rotulo}
      data-lado={cota.outward.y > 0 ? 'abajo' : undefined}
      onClick={(e) => {
        // La captura puede entregar el clic al botón aunque el puntero bajó
        // sobre Ángulo. Conservamos ese campo desde pointerdown; los clics de
        // teclado y de navegación usan su propio destino, sin heredar un gesto.
        const indice = e.detail > 0 ? campoPulsado.current ?? indiceEn(e.target) : indiceEn(e.target);
        campoPulsado.current = null;
        if (skipClick.current) { skipClick.current = false; return; }
        abrir(indice);
      }}
      onKeyDown={(e) => {
        // Espacio y Enter son del botón (abren la edición por el clic
        // nativo); que no lleguen al atajo global de simular ni al router.
        if (e.key === ' ' || e.key === 'Enter') e.stopPropagation();
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        campoPulsado.current = indiceEn(e.target);
        const campo = campos[campoPulsado.current];
        if (campo.scrub === false) return;
        scrub.current = { cota: campo, x0: e.clientX, v0: campo.valueMm, moved: false, last: campo.valueMm };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s = scrub.current;
        if (!s) return;
        const dx = e.clientX - s.x0;
        if (!s.moved) {
          if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
          s.moved = true;
          onScrubStart(s.cota);
        }
        // El ángulo no es una distancia sobre el patrón: dividirlo por zoom
        // haría que el mismo gesto cambiara según cuánto amplió María el lienzo.
        const tasa = s.cota.unit === 'deg' ? 0.5 : 1 / zoom2D;
        const v = acota(round1(s.v0 + dx * tasa * ganancia(e)), s.cota);
        s.last = v;
        onScrub(s.cota, v);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        terminarScrub(s => s.last);
      }}
      onPointerCancel={cancelarScrub}
      onLostPointerCapture={() => terminarScrub(s => s.last)}
    >
      {agrupado ? campos.map((campo, indice) => (
        <span key={campo.id} data-campo={indice}>
          {indice > 0 && ' · '}{textoVisible(campo)}
        </span>
      )) : textoVisible(cota)}
    </button>
  );
}
