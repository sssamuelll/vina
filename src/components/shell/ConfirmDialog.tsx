/**
 * ConfirmDialog — la superficie que faltaba.
 *
 * `copilotUI.pendingConfirmation` existe desde hace tiempo, con un contrato
 * completo (título, descripción, consecuencias, destructivo, y tres formas de
 * llevar la acción: `callbackKey` para hooks, `reduxAction` para middleware,
 * `action` para el copiloto). `useGuardedAction` lo despacha y lo usan Tijeras
 * y Fusionar. Lo que nunca se escribió fue quien lo pintara: el comentario de
 * `useGuardedAction` nombra un `CopilotUIOverlay` que no existe en el repo.
 *
 * Medido en la app corriendo el 2026-08-14: al despachar `showConfirmation`,
 * el estado entra al store y `document.body.innerHTML` no cambia ni un
 * carácter. `memoryTools.ts` incluso lo dice por escrito —"the Redux
 * confirmation dialog is a dark surface"— y por eso se rodeó con un
 * `window.confirm` nativo.
 *
 * Éste es el noveno contrato escrito y rodeado que encontró la auditoría, y el
 * único que además dejaba una función a medio camino.
 *
 * Contrato de interfaz: material `overlay` (flota sobre el documento y se va),
 * cero colores literales, español, y `:focus-visible` en todo lo que tiene
 * `:hover`. Ver .claude/skills/contrato-de-interfaz/.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AlertTriangle } from 'lucide-react';
import type { RootState, AppDispatch } from '../../store';
import { dismissConfirmation } from '../../store/copilotUISlice';
import { resolveCallback, rejectCallback } from '../../hooks/useGuardedAction';
import './ConfirmDialog.css';

export default function ConfirmDialog() {
  const dispatch = useDispatch<AppDispatch>();
  const pending = useSelector((s: RootState) => s.copilotUI.pendingConfirmation);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const cerrar = useCallback(() => {
    // Cancelar no es "no hacer nada": hay llamadores esperando un `false`
    // (requestConfirmation). Y de paso saca el callback del registro — si se
    // quedara, el Map crecería con cada cancelación y un `resolve` tardío
    // podría ejecutar una acción que la usuaria ya descartó.
    if (pending?.callbackKey) rejectCallback(pending.callbackKey);
    dispatch(dismissConfirmation());
  }, [dispatch, pending]);

  const confirmar = useCallback(() => {
    if (!pending) return;
    if (pending.callbackKey) {
      resolveCallback(pending.callbackKey)?.();
    } else if (pending.reduxAction) {
      // El middleware de confirmación reenvía la acción original; `meta` la
      // marca para que no vuelva a pedir confirmación y entre en bucle.
      const accion = pending.reduxAction as { type: string; payload?: unknown };
      dispatch({ ...accion, meta: { skipConfirmation: true } } as never);
    }
    dispatch(dismissConfirmation());
  }, [dispatch, pending]);

  // El foco arranca en el botón de acción para que Enter/Escape funcionen sin
  // tocar el mouse; Escape cancela, como en los demás modales del shell.
  useEffect(() => {
    if (!pending) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, cerrar]);

  if (!pending) return null;

  const { title, description, consequences, destructive } = pending;

  return (
    <div className="confirm-scrim" data-material="papel" onMouseDown={cerrar}>
      <div
        className="confirm-dialog"
        data-superficie="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        data-destructive={String(destructive)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog__head">
          {destructive && <AlertTriangle size={15} className="confirm-dialog__icon" aria-hidden />}
          <h2 className="confirm-dialog__title" id="confirm-dialog-title">{title}</h2>
        </div>

        <p className="confirm-dialog__desc">{description}</p>

        {consequences.length > 0 && (
          <ul className="confirm-dialog__consequences">
            {consequences.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}

        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__btn" onClick={cerrar}>
            Cancelar
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={`confirm-dialog__btn confirm-dialog__btn--${destructive ? 'destructive' : 'primary'}`}
            onClick={confirmar}
          >
            {pending.confirmLabel ?? (destructive ? 'Eliminar' : 'Confirmar')}
          </button>
        </div>
      </div>
    </div>
  );
}
