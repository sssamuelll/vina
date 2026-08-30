import { useEffect, useRef, useState } from 'react';
import type { Cota } from './cotas';
import { parseMedida, formatMedida } from './parseMedida';
import { DRAG_THRESHOLD_PX } from '../gestureConstants';
import './cotas.css';

export interface CotaChipProps {
  cota: Cota;
  /** Px de pantalla, ya calculados por la capa (centro del chip). */
  left: number;
  top: number;
  zoom2D: number;
  disabled?: boolean;
  onCommit: (cota: Cota, valueMm: number) => void;
  onScrubStart: (cota: Cota) => void;
  onScrub: (cota: Cota, valueMm: number) => void;
  onScrubEnd: (cota: Cota, valueMm: number) => void;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const acota = (v: number, c: Cota) => Math.min(c.max, Math.max(c.min, v));
/** El valor como lo escribiría ella: coma decimal, sin unidad. */
const aTexto = (v: number) => String(round1(v)).replace('.', ',');
/** Una sola escala de modificadores para scrub y flechas: Shift grueso, Alt fino (Figma). */
const ganancia = (e: { shiftKey: boolean; altKey: boolean }) => (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);

/** Los chips de la capa, en orden del DOM: es el orden del Tab. */
function chipsHermanos(el: HTMLElement | null): HTMLElement[] {
  const capa = el?.closest('.cotas');
  return capa ? Array.from(capa.querySelectorAll<HTMLElement>('.cota:not([aria-disabled="true"])')) : [];
}

/**
 * Un chip de cota (spec 2026-08-30 § 5.3): en reposo es un botón — clic →
 * edición; arrastre ≥ 4 px → scrub con el puntero capturado —; en edición es
 * un campo de texto. Solo Enter y Tab confirman; Escape y el blur descartan
 * (la selección cambia en mousedown, antes del blur: confirmar ahí sería una
 * carrera). Tab mueve el foco al chip vecino por su cuenta, porque el input
 * se desmonta en el mismo tick y la navegación nativa perdería el punto de
 * partida. Nada de `type="number"`: la rueda no cambia el valor y la coma
 * decimal entra. Las teclas del campo detienen la propagación — CF-1 ya
 * ignora targets editables; esto es el cinturón.
 */
export default function CotaChip({
  cota, left, top, zoom2D, disabled = false, onCommit, onScrubStart, onScrub, onScrubEnd,
}: CotaChipProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrub = useRef<{ x0: number; v0: number; moved: boolean; last: number } | null>(null);
  const skipClick = useRef(false);
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
    (vecino ?? boton).focus();
  }, [editing]);

  // Un scrub que se queda sin puntero (cancel, captura perdida, desmontaje)
  // termina con el valor de partida: nunca queda un batch abierto.
  useEffect(() => () => {
    const s = scrub.current;
    scrub.current = null;
    if (s?.moved) onScrubEnd(cota, s.v0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrir = () => {
    if (disabled) return;
    setDraft(aTexto(cota.valueMm));
    setInvalid(false);
    cerrado.current = false;
    setEditing(true);
  };
  const cerrar = (foco: 'boton' | 'siguiente' | 'anterior' | null) => {
    cerrado.current = true;
    focoAlCerrar.current = foco;
    setEditing(false);
  };
  const parsea = (): number | null => {
    const v = parseMedida(draft);
    return v !== null && v >= cota.min && v <= cota.max ? round1(v) : null;
  };
  const confirmar = (): boolean => {
    const v = parsea();
    if (v === null) {
      setInvalid(true);
      return false;
    }
    if (v !== round1(cota.valueMm)) onCommit(cota, v);
    return true;
  };
  const terminarScrub = (valor: (s: { v0: number; last: number }) => number) => {
    const s = scrub.current;
    scrub.current = null;
    if (s?.moved) {
      skipClick.current = true;
      onScrubEnd(cota, valor(s));
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        className={`cota cota--editando${invalid ? ' cota--invalida' : ''}`}
        style={{ left, top }}
        aria-label={cota.label}
        aria-invalid={invalid || undefined}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            if (confirmar()) cerrar('boton');
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cerrar('boton');
          } else if (e.key === 'Tab') {
            e.preventDefault();
            if (confirmar()) cerrar(e.shiftKey ? 'anterior' : 'siguiente');
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = parseMedida(draft) ?? cota.valueMm;
            const paso = ganancia(e) * (e.key === 'ArrowUp' ? 1 : -1);
            setDraft(aTexto(acota(base + paso, cota)));
            setInvalid(false);
          }
        }}
        onBlur={() => { if (!cerrado.current) cerrar(null); }}
      />
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`cota${cota.primary ? '' : ' cota--hueca'}`}
      style={{ left, top }}
      aria-label={`${cota.label}: ${formatMedida(cota.valueMm, cota.unit)}`}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (skipClick.current) { skipClick.current = false; return; }
        abrir();
      }}
      onKeyDown={(e) => {
        // Espacio y Enter son del botón (abren la edición por el clic
        // nativo); que no lleguen al atajo global de simular ni al router.
        if (e.key === ' ' || e.key === 'Enter') e.stopPropagation();
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        scrub.current = { x0: e.clientX, v0: cota.valueMm, moved: false, last: cota.valueMm };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const s = scrub.current;
        if (!s) return;
        const dx = e.clientX - s.x0;
        if (!s.moved) {
          if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
          s.moved = true;
          onScrubStart(cota);
        }
        // 1 px de pantalla = 1/zoom mm: la geometría sigue al cursor 1:1.
        const v = acota(round1(s.v0 + (dx / zoom2D) * ganancia(e)), cota);
        s.last = v;
        onScrub(cota, v);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        terminarScrub(s => s.last);
      }}
      onPointerCancel={() => terminarScrub(s => s.v0)}
      onLostPointerCapture={() => terminarScrub(s => s.last)}
    >
      {formatMedida(cota.valueMm, cota.unit)}
    </button>
  );
}
