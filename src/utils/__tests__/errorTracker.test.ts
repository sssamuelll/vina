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

it('un error de device perdido persistido con persistForReload vuelve al ring tras recargar', async () => {
  const firstLoad = await import('../errorTracker');
  const pushError = (firstLoad as typeof firstLoad & { pushError?: PushError }).pushError;
  const entry = {
    message: 'destroyed: GPU device was destroyed',
    source: 'webgpu-device-lost',
    timestamp: 30,
  };
  pushError!(entry, { persistForReload: true });

  vi.resetModules();
  const afterReload = await import('../errorTracker');
  afterReload.initErrorTracker();
  expect(afterReload.getTrackedErrors()).toContainEqual(entry);
});

it('pushError deja error/error en la bitácora; la rehidratación de initErrorTracker no espeja', async () => {
  const firstLoad = await import('../errorTracker');
  const firstJournal = await import('../telemetry/journal');
  firstJournal.clearJournal();

  const pushError = (firstLoad as typeof firstLoad & { pushError?: PushError }).pushError;
  const entry = { message: 'fatal en vivo', source: 'test-source', timestamp: 60 };
  pushError!(entry, { persistForReload: true });

  expect(firstJournal.getJournal().events).toContainEqual(
    expect.objectContaining({
      kind: 'error',
      name: 'error',
      data: { source: 'test-source', message: 'fatal en vivo' },
    }),
  );

  vi.resetModules();
  const afterReload = await import('../errorTracker');
  const journalAfterReload = await import('../telemetry/journal');
  journalAfterReload.clearJournal();

  afterReload.initErrorTracker();

  expect(afterReload.getTrackedErrors()).toContainEqual(entry);
  expect(journalAfterReload.getJournal().events.some((e) => e.kind === 'error')).toBe(false);
});
