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

/**
 * Un chip de cota (spec 2026-08-30 § 5.3): en reposo es un botón — clic →
 * edición; arrastre ≥ 4 px → scrub con el puntero capturado —; en edición es
 * un campo de texto: Enter confirma (una vez), Escape descarta, Tab confirma
 * y deja pasar el Tab nativo al siguiente chip, blur confirma si el texto es
 * válido y distinto. Nada de `type="number"`: la rueda no cambia el valor y
 * la coma decimal entra. Las teclas del campo detienen la propagación —
 * CF-1 ya ignora targets editables; esto es el cinturón.
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
  const devolverFoco = useRef(false);
  /** Cerrado por tecla: el blur que pueda seguir no debe confirmar de nuevo. */
  const cerrado = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (devolverFoco.current) {
      devolverFoco.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const abrir = () => {
    if (disabled) return;
    setDraft(aTexto(cota.valueMm));
    setInvalid(false);
    cerrado.current = false;
    setEditing(true);
  };
  const cerrar = (conFoco: boolean) => {
    cerrado.current = true;
    devolverFoco.current = conFoco;
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
            if (confirmar()) cerrar(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cerrar(true);
          } else if (e.key === 'Tab') {
            if (confirmar()) cerrar(false);
            else e.preventDefault();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = parseMedida(draft) ?? cota.valueMm;
            const paso = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
            setDraft(aTexto(acota(base + paso, cota)));
            setInvalid(false);
          }
        }}
        onBlur={() => {
          if (cerrado.current) return;
          const v = parsea();
          if (v !== null && v !== round1(cota.valueMm)) onCommit(cota, v);
          cerrar(false);
        }}
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
        // 1 px de pantalla = 1/zoom mm: la geometría sigue al cursor 1:1. Shift afina ×0,1.
        const delta = (dx / zoom2D) * (e.shiftKey ? 0.1 : 1);
        const v = acota(round1(s.v0 + delta), cota);
        s.last = v;
        onScrub(cota, v);
      }}
      onPointerUp={(e) => {
        const s = scrub.current;
        scrub.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        if (s?.moved) {
          skipClick.current = true;
          onScrubEnd(cota, s.last);
        }
      }}
      onPointerCancel={() => {
        const s = scrub.current;
        scrub.current = null;
        if (s?.moved) onScrubEnd(cota, s.v0);
      }}
    >
      {formatMedida(cota.valueMm, cota.unit)}
    </button>
  );
}
