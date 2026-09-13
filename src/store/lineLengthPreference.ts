import type { EditorState } from '../types/types';
import { storageGet, storageSet } from '../utils/storage';
import { hydrateLineLengthMode } from './editorSlice';

export type LineLengthMode = EditorState['lineLengthMode'];

type PreferenceState = Pick<EditorState, 'lineLengthMode' | 'lineLengthModeSetByUser'>;

interface LineLengthPreferenceStore {
  getState(): { editor: PreferenceState };
  dispatch(action: ReturnType<typeof hydrateLineLengthMode>): unknown;
  subscribe(listener: () => void): () => void;
}

const STORAGE_KEY = 'line-length-mode';

function isLineLengthMode(value: unknown): value is LineLengthMode {
  return value === 'all' || value === 'none';
}

export function initLineLengthPreference(store: LineLengthPreferenceStore): () => void {
  let active = true;
  let previous = store.getState().editor;
  let writeQueue: Promise<void> = Promise.resolve();

  const unsubscribe = store.subscribe(() => {
    const current = store.getState().editor;
    const changed = current.lineLengthMode !== previous.lineLengthMode
      || current.lineLengthModeSetByUser !== previous.lineLengthModeSetByUser;
    previous = current;
    if (!changed || !current.lineLengthModeSetByUser) return;

    const mode = current.lineLengthMode;
    writeQueue = writeQueue
      .then(() => {
        // shape: LineLengthMode v1 — opt-in envelope: no
        return storageSet('settings', STORAGE_KEY, mode);
      })
      .catch(() => undefined);
  });

  void storageGet('settings', STORAGE_KEY)
    .then((value) => {
      if (!active) return;
      if (isLineLengthMode(value)) store.dispatch(hydrateLineLengthMode(value));
      // 'creation' es el tercer estado retirado (firma de María 2026-09-12):
      // quien lo probó en esa rama lo tiene guardado en IDB. Se migra a
      // 'none' explícitamente en vez de solo rechazarlo — el default ya es
      // 'none', pero esto no depende de que siga siéndolo.
      else if (value === 'creation') store.dispatch(hydrateLineLengthMode('none'));
    })
    .catch(() => undefined);

  return () => {
    active = false;
    unsubscribe();
  };
}
