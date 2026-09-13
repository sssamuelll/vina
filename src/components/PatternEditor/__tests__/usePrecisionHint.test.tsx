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

  it('nace apagada (sin parpadeo en frío) y se queda apagada cuando ya fue usada', async () => {
    vi.mocked(storageGet).mockResolvedValue(true);
    const { result } = renderHook(() => usePrecisionHint());
    expect(result.current.showPrecisionHint).toBe(false);
    await waitFor(() => expect(storageGet).toHaveBeenCalledWith('settings', 'precision-hint-used'));
    expect(result.current.showPrecisionHint).toBe(false);
    expect(storageSet).not.toHaveBeenCalled();
  });

  it('sin marca previa: nace apagada y se enciende al confirmar que nunca se usó', async () => {
    vi.mocked(storageGet).mockResolvedValue(undefined);
    const { result } = renderHook(() => usePrecisionHint());
    expect(result.current.showPrecisionHint).toBe(false);
    await waitFor(() => expect(result.current.showPrecisionHint).toBe(true));
  });

  it('si IDB falla al hidratar, se enciende igual (ayuda degradable) sin parpadeo previo', async () => {
    vi.mocked(storageGet).mockRejectedValue(new Error('idb no disponible'));
    const { result } = renderHook(() => usePrecisionHint());
    expect(result.current.showPrecisionHint).toBe(false);
    await waitFor(() => expect(result.current.showPrecisionHint).toBe(true));
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
