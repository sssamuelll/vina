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
  return value === 'creation' || value === 'all' || value === 'none';
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
      if (active && isLineLengthMode(value)) store.dispatch(hydrateLineLengthMode(value));
    })
    .catch(() => undefined);

  return () => {
    active = false;
    unsubscribe();
  };
}
