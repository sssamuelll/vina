/** @vitest-environment jsdom */
import { beforeEach, expect, it, vi } from 'vitest';

type PushError = (
  entry: { message: string; source?: string; timestamp: number; stack?: string },
  options?: { persistForReload?: boolean },
) => void;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

it('persiste el boundary síncronamente y lo recupera al iniciar', async () => {
  const firstLoad = await import('../errorTracker');
  const pushError = (firstLoad as typeof firstLoad & { pushError?: PushError }).pushError;
  expect(pushError).toEqual(expect.any(Function));
  const entry = {
    message: 'fatal',
    source: 'AppErrorBoundary',
    timestamp: 10,
  };

  pushError!(entry, { persistForReload: true });

  expect(JSON.parse(
    localStorage.getItem(firstLoad.LAST_BOUNDARY_ERROR_KEY)!,
  )).toEqual(entry);

  vi.resetModules();
  const afterReload = await import('../errorTracker');
  afterReload.initErrorTracker();
  expect(afterReload.getTrackedErrors()).toContainEqual(entry);
});

it('limpia la memoria y la ranura síncrona del último boundary', async () => {
  const tracker = await import('../errorTracker');
  const pushError = (tracker as typeof tracker & { pushError?: PushError }).pushError;
  expect(pushError).toEqual(expect.any(Function));
  const entry = {
    message: 'fatal',
    source: 'PanelErrorBoundary:Propiedades',
    timestamp: 20,
  };
  pushError!(entry, { persistForReload: true });

  tracker.clearTrackedErrors();

  expect(tracker.getTrackedErrors()).toEqual([]);
  expect(localStorage.getItem(tracker.LAST_BOUNDARY_ERROR_KEY)).toBeNull();
});
