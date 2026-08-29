import type { Middleware } from '@reduxjs/toolkit';
import { pushJournal, resumir } from '../utils/telemetry/journal';

/**
 * @cascade (mechanism, not user-facing cascade)
 * shape: observer — registra cada acción en la bitácora y la deja pasar intacta
 * triggers: toda acción despachada (va primera en la cadena, antes de la confirmación,
 *           para ver también lo que la confirmación bloquea)
 * dispatches: none
 * meta-flags: ninguna propia; copia `meta` resumido al evento
 * guard: `simulation/setFrameTime` no se registra (su valor ya vive en el slice)
 * undo: n/a
 * side effect: append al ring de `src/utils/telemetry/journal.ts`
 * cap-depth: n/a (no despacha)
 * cross-ref: docs/superpowers/specs/2026-08-29-caja-negra-bitacora-design.md § 3.1
 */
export const journalMiddleware: Middleware = () => (next) => (action) => {
  const a = action as { type?: unknown; payload?: unknown; meta?: unknown };
  if (typeof a?.type === 'string' && a.type !== 'simulation/setFrameTime') {
    const data: Record<string, unknown> = {};
    if (a.payload !== undefined) data.payload = resumir(a.payload);
    if (a.meta !== undefined) data.meta = resumir(a.meta);
    pushJournal('action', a.type, data);
  }
  return next(action);
};
