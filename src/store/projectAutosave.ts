/**
 * Project autosave — the wiring between projectIO's persistence plumbing and
 * the live store. Browsers are volatile: without this, a reload loses every
 * piece the user imported or drew.
 *
 * Lifecycle (hydrate-then-subscribe, anti-clobber order):
 *  1. Boot: read the IDB autosave slot via `loadFromStorage()` (zod-parsed,
 *     corrupt blobs quarantined upstream — projectIO contract).
 *     - Valid project with content → `restoreProject` (faithful: no auto-sew/
 *       auto-rename) + `requestFitView` + an info toast with an
 *       "Empezar de cero" action (payload: NEW_PROJECT).
 *     - Corrupt → honest error toast; the quarantined blob preserves the work.
 *     - Absent/empty → nothing.
 *  2. ONLY THEN attach a focused debounced subscriber (same isolation pattern
 *     as persistDocks/persistInputScheme in store/index.ts) that writes the
 *     project slice to IDB after AUTOSAVE_DEBOUNCE_MS of quiet.
 *  3. `visibilitychange → hidden` flushes any pending save immediately, so a
 *     closed tab loses at most nothing instead of the last debounce window.
 *
 * Storage conventions per B6 (docs/reports/2026-04-30-drift-fase2-b6state-
 * persistencia.md): IDB-canonical single slot (projects/autosave), reuse of
 * saveToStorage/loadFromStorage, silent-degradable writes (ratified Variant D),
 * versioning opt-in deferred until the shape changes destructively.
 */
import type { UnknownAction } from '@reduxjs/toolkit';
import { loadFromStorage, saveToStorage } from '../utils/projectIO';
import { restoreProject } from './projectSlice';
import { requestFitView } from './editorSlice';
import { showToast, showErrorToast } from './copilotUISlice';
import { NEW_PROJECT, RESEW_AI_SEAMS } from './actions';
import { isStaleAiSeam } from '../utils/autoSew';
import type { Seam } from '../types/types';
import { pushJournal } from '../utils/telemetry/journal';

export const AUTOSAVE_DEBOUNCE_MS = 1500;

/** Minimal structural store contract (testable with a fake; satisfied by the real store). */
export interface PersistenceStore {
  getState(): { project: unknown };
  dispatch(action: UnknownAction): unknown;
  subscribe(listener: () => void): () => void;
}

const piecesLabel = (n: number) => (n === 1 ? '1 pieza' : `${n} piezas`);

export async function initProjectPersistence(store: PersistenceStore): Promise<void> {
  // ── 1. Hydrate first ──
  try {
    const result = await loadFromStorage();
    if (result && result.ok) {
      const project = result.project;
      const hasContent = project.pieces.length > 0 || project.seams.length > 0;
      if (hasContent) {
        // restoreProject, NOT loadProject: the import pipeline's generative
        // enrichment (auto-rename/auto-sew) must not run on a faithful restore.
        // La hidratación establece el estado base de la sesión; no es una
        // edición de la usuaria y, por tanto, reinicia la historia de deshacer.
        store.dispatch({ ...restoreProject(project), meta: { resetUndoHistory: true } });
        store.dispatch(requestFitView()); // frame the restored work (no blank canvas)
        store.dispatch(showToast({
          type: 'info',
          message: `Restauré tu proyecto: ${piecesLabel(project.pieces.length)}`,
          actionLabel: 'Empezar de cero',
          actionPayload: NEW_PROJECT(),
          duration: 8000,
        }));
        // Costuras IA de un motor anterior (SEAM_ENGINE_VERSION): sin esto,
        // un proyecto viejo arrastra costuras malas para siempre — el
        // autoSew generativo solo corre con seams vacías y el dedupe de
        // runAutoSew bloquea las nuevas contra las viejas. El botón puentea
        // al thunk resewAiSeams vía resewBridgeMiddleware.
        const seams = (project.seams ?? []) as Seam[];
        if (seams.some(isStaleAiSeam)) {
          store.dispatch(showToast({
            type: 'warning',
            message: 'Este proyecto tiene costuras generadas con un motor de cosido anterior — pueden drapear mal',
            actionLabel: 'Re-coser',
            actionPayload: RESEW_AI_SEAMS(),
            duration: 12000,
          }));
        }
      }
    } else if (result && !result.ok) {
      // projectIO already quarantined the corrupt blob; tell the user honestly.
      store.dispatch(showErrorToast('No pude restaurar tu último proyecto — guardé un respaldo en cuarentena.'));
    }
  } catch {
    // Storage-degradable (E-async ratified Variant D): boot must never crash
    // on a bad autosave read; the storage layer owns the degraded-state signal.
  }

  // ── 2. Then subscribe (focused, debounced) ──
  const save = () => {
    // Fire-and-forget: silent-degradable write per B6 §3.8 (telemetry hook
    // inside storageSet owns quota/unavailable signals). Único cambio de
    // control de flujo de la caja negra: then(ok, fail) en vez de catch
    // mudo, para que la bitácora vea éxito/fallo y duración (spec § 3.7).
    const t0 = performance.now();
    void saveToStorage(store.getState().project as Parameters<typeof saveToStorage>[0]).then(
      () => pushJournal('storage', 'autosave', { ok: true, ms: Math.round(performance.now() - t0) }),
      (e) => pushJournal('storage', 'autosave', {
        ok: false,
        ms: Math.round(performance.now() - t0),
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  };

  let prev = store.getState().project;
  let timer: ReturnType<typeof setTimeout> | null = null;

  store.subscribe(() => {
    const project = store.getState().project;
    if (project === prev) return; // focused: only project-slice changes
    prev = project;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; save(); }, AUTOSAVE_DEBOUNCE_MS);
  });

  // ── 3. Flush on tab-hide — the last debounce window must not be losable ──
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && timer !== null) {
        clearTimeout(timer);
        timer = null;
        save();
      }
    });
  }
}
