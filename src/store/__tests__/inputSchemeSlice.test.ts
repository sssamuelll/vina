import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/storage', () => ({
  storageGet: vi.fn(),
  storageSet: vi.fn().mockResolvedValue(undefined),
}));

import reducer, {
  setUserScheme, autoDetectTrackpad, rehydrateInputScheme,
  hydrateInputScheme, persistInputScheme,
  type InputSchemeState,
} from '../inputSchemeSlice';
import { storageGet, storageSet } from '../../utils/storage';

const initial: InputSchemeState = { scheme: 'mouse', source: 'default' };

describe('inputSchemeSlice reducers', () => {
  it('starts as mouse/default', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(initial);
  });

  it('setUserScheme always wins and marks source user', () => {
    const s = reducer({ scheme: 'trackpad', source: 'auto' }, setUserScheme('mouse'));
    expect(s).toEqual({ scheme: 'mouse', source: 'user' });
  });

  it('autoDetectTrackpad applies ONLY from source=default', () => {
    expect(reducer(initial, autoDetectTrackpad()))
      .toEqual({ scheme: 'trackpad', source: 'auto' });
    expect(reducer({ scheme: 'mouse', source: 'user' }, autoDetectTrackpad()))
      .toEqual({ scheme: 'mouse', source: 'user' }); // explicit choice never overridden
    expect(reducer({ scheme: 'trackpad', source: 'auto' }, autoDetectTrackpad()))
      .toEqual({ scheme: 'trackpad', source: 'auto' }); // idempotent
  });

  it('rehydrateInputScheme replaces state', () => {
    expect(reducer(initial, rehydrateInputScheme({ scheme: 'trackpad', source: 'user' })))
      .toEqual({ scheme: 'trackpad', source: 'user' });
  });

  it('rehydrateInputScheme never clobbers a session where user/heuristic already acted', () => {
    expect(reducer({ scheme: 'trackpad', source: 'auto' }, rehydrateInputScheme({ scheme: 'mouse', source: 'user' })))
      .toEqual({ scheme: 'trackpad', source: 'auto' });
    expect(reducer({ scheme: 'mouse', source: 'user' }, rehydrateInputScheme({ scheme: 'trackpad', source: 'auto' })))
      .toEqual({ scheme: 'mouse', source: 'user' });
  });
});

describe('hydrateInputScheme (zod envelope, silent-degradable per E-async-states)', () => {
  beforeEach(() => vi.mocked(storageGet).mockReset());

  it('returns parsed state for a valid v1 envelope', async () => {
    vi.mocked(storageGet).mockResolvedValue({ version: 1, data: { scheme: 'trackpad', source: 'user' } });
    expect(await hydrateInputScheme()).toEqual({ scheme: 'trackpad', source: 'user' });
  });

  it('returns null when nothing persisted', async () => {
    vi.mocked(storageGet).mockResolvedValue(undefined);
    expect(await hydrateInputScheme()).toBeNull();
  });

  it('returns null when stored value is null (not undefined)', async () => {
    vi.mocked(storageGet).mockResolvedValue(null);
    expect(await hydrateInputScheme()).toBeNull();
  });

  it('returns null on corrupt payload (default Mouse, no crash)', async () => {
    vi.mocked(storageGet).mockResolvedValue({ version: 99, scheme: 'gamepad' });
    expect(await hydrateInputScheme()).toBeNull();
  });
});

describe('persistInputScheme', () => {
  it('writes the v1 envelope to settings/input-scheme', () => {
    persistInputScheme({ scheme: 'trackpad', source: 'auto' });
    expect(storageSet).toHaveBeenCalledWith('settings', 'input-scheme',
      { version: 1, data: { scheme: 'trackpad', source: 'auto' } });
  });
});
