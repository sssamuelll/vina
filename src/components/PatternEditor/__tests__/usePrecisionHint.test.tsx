// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/storage', () => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
}));

import { storageGet, storageSet } from '../../../utils/storage';
import { usePrecisionHint } from '../usePrecisionHint';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe('usePrecisionHint', () => {
  beforeEach(() => {
    vi.mocked(storageGet).mockReset();
    vi.mocked(storageSet).mockReset();
    vi.mocked(storageSet).mockResolvedValue(undefined);
  });

  it('oculta la pista cuando ya fue usada y no reescribe al hidratar', async () => {
    vi.mocked(storageGet).mockResolvedValue(true);
    const { result } = renderHook(() => usePrecisionHint());
    expect(result.current.showPrecisionHint).toBe(true);
    await waitFor(() => expect(result.current.showPrecisionHint).toBe(false));
    expect(storageGet).toHaveBeenCalledWith('settings', 'precision-hint-used');
    expect(storageSet).not.toHaveBeenCalled();
  });

  it('la apaga de inmediato y persiste una sola vez', () => {
    vi.mocked(storageGet).mockResolvedValue(undefined);
    const { result } = renderHook(() => usePrecisionHint());
    act(() => {
      result.current.markPrecisionUsed();
      result.current.markPrecisionUsed();
    });
    expect(result.current.showPrecisionHint).toBe(false);
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(storageSet).toHaveBeenCalledWith('settings', 'precision-hint-used', true);
  });

  it('una hidratacion tardia nunca vuelve a encenderla despues de marcar', async () => {
    const read = deferred<unknown>();
    vi.mocked(storageGet).mockReturnValue(read.promise);
    const { result } = renderHook(() => usePrecisionHint());
    act(() => result.current.markPrecisionUsed());
    expect(result.current.showPrecisionHint).toBe(false);
    await act(async () => {
      read.resolve(false);
      await read.promise;
    });
    expect(result.current.showPrecisionHint).toBe(false);
    expect(storageSet).toHaveBeenCalledTimes(1);
  });
});
