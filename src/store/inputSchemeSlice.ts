import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import { storageGet, storageSet } from '../utils/storage';
import type { InputSchemeId } from '../input/wheelIntents';

/** Who chose the current scheme. 'user' is sticky: the heuristic never overrides it. */
export type SchemeSource = 'default' | 'auto' | 'user';

export interface InputSchemeState {
  scheme: InputSchemeId;
  source: SchemeSource;
}

const initialState: InputSchemeState = { scheme: 'mouse', source: 'default' };

const STORAGE_KEY = 'input-scheme';

const PersistedSchema = z
  .object({
    version: z.literal(1),
    data: z
      .object({
        scheme: z.enum(['mouse', 'trackpad']),
        source: z.enum(['default', 'auto', 'user']),
      })
      .strict(),
  })
  .strict();

/** Load persisted scheme. Corrupt/missing → null (caller keeps default Mouse —
 *  silent-degradable storage per E-async-states). */
export async function hydrateInputScheme(): Promise<InputSchemeState | null> {
  const raw = await storageGet('settings', STORAGE_KEY);
  if (raw == null) return null;
  const parsed = PersistedSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { scheme: parsed.data.data.scheme, source: parsed.data.data.source };
}

export function persistInputScheme(state: InputSchemeState): void {
  // shape: InputSchemePersisted v1 — opt-in envelope: yes
  // `source` is persisted deliberately: a stored 'auto'/'user' keeps the
  // one-shot heuristic from re-firing on the next session.
  void storageSet('settings', STORAGE_KEY, {
    version: 1,
    data: { scheme: state.scheme, source: state.source },
  });
}

const inputSchemeSlice = createSlice({
  name: 'inputScheme',
  initialState,
  reducers: {
    setUserScheme(state, action: PayloadAction<InputSchemeId>) {
      state.scheme = action.payload;
      state.source = 'user';
    },
    autoDetectTrackpad(state) {
      if (state.source !== 'default') return; // explicit/previous choice always wins
      state.scheme = 'trackpad';
      state.source = 'auto';
    },
    rehydrateInputScheme(state, action: PayloadAction<InputSchemeState>) {
      // Async IDB hydrate may land AFTER the user or the heuristic already
      // acted this session — never clobber a non-default source.
      if (state.source !== 'default') return;
      return action.payload;
    },
  },
});

export const { setUserScheme, autoDetectTrackpad, rehydrateInputScheme } = inputSchemeSlice.actions;
export default inputSchemeSlice.reducer;
