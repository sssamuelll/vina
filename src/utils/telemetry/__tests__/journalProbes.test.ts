/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `initJournal` tiene estado de módulo (`_initialized`, el envoltorio de
// consola): cada caso necesita una instancia fresca, igual que
// `errorTracker.test.ts` — `vi.resetModules()` + `await import(...)` por caso.

const REAL_WARN = console.warn;
const REAL_ERROR = console.error;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

afterEach(() => {
  // El envoltorio de consola reemplaza console.warn/error en el objeto
  // global real (vi.resetModules no lo toca): sin esto, un caso deja el
  // siguiente arrancando sobre un console ya envuelto.
  console.warn = REAL_WARN;
  console.error = REAL_ERROR;
  vi.restoreAllMocks();
  vi.doUnmock('../journal');
  vi.doUnmock('../../storage');
});

describe('journalProbes — initJournal', () => {
  it('dos llamadas instalan un solo listener de visibilitychange', async () => {
    const { initJournal } = await import('../journalProbes');
    const { getJournal, clearJournal } = await import('../journal');
    initJournal();
    initJournal();
    clearJournal();

    document.dispatchEvent(new Event('visibilitychange'));

    const visibility = getJournal().events.filter((e) => e.kind === 'session' && e.name === 'visibility');
    expect(visibility).toHaveLength(1);
    expect(visibility[0].n).toBeUndefined(); // n:2 delataría dos listeners fundidos en uno
  });

  it('console.warn llama al original primero y registra un Error como "name: message"', async () => {
    const original = vi.fn();
    console.warn = original as typeof console.warn;

    const { initJournal } = await import('../journalProbes');
    const { getJournal, clearJournal } = await import('../journal');
    initJournal();
    clearJournal();

    const err = new TypeError('boom');
    console.warn(err);

    expect(original).toHaveBeenCalledWith(err);
    const consoleEvents = getJournal().events.filter((e) => e.kind === 'console' && e.name === 'warn');
    expect(consoleEvents).toHaveLength(1);
    expect(consoleEvents[0].data?.message).toContain('TypeError: boom');
  });

  it('un objeto circular como argumento no lanza y deja un console/warn', async () => {
    const { initJournal } = await import('../journalProbes');
    const { getJournal, clearJournal } = await import('../journal');
    initJournal();
    clearJournal();

    const circular: Record<string, unknown> = { id: 'x' };
    circular.self = circular;

    expect(() => console.warn('algo pasó', circular)).not.toThrow();
    const events = getJournal().events.filter((e) => e.kind === 'console' && e.name === 'warn');
    expect(events).toHaveLength(1);
  });

  it('la reentrada no recursa: un pushJournal que dispara console.warn no revienta la pila', async () => {
    const original = vi.fn();
    console.warn = original as typeof console.warn;

    vi.doMock('../journal', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../journal')>();
      return {
        ...actual,
        pushJournal: (...args: Parameters<typeof actual.pushJournal>) => {
          // Solo el espejo de consola (kind 'console') puede reentrar de verdad;
          // 'session/load' del propio initJournal no debe disparar esto.
          if (args[0] === 'console') console.warn('inner');
          actual.pushJournal(...args);
        },
      };
    });

    const { initJournal } = await import('../journalProbes');
    initJournal();

    expect(() => console.warn('outer')).not.toThrow();
    expect(original.mock.calls.map((c) => c[0])).toEqual(['outer', 'inner']);
  });

  it('visibilitychange a hidden deja session/visibility y persiste la cola de rescate', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    const { initJournal } = await import('../journalProbes');
    const { getJournal, clearJournal, JOURNAL_TAIL_KEY } = await import('../journal');
    initJournal();
    clearJournal();

    document.dispatchEvent(new Event('visibilitychange'));

    expect(getJournal().events).toContainEqual(
      expect.objectContaining({ kind: 'session', name: 'visibility', data: { state: 'hidden' } }),
    );
    expect(localStorage.getItem(JOURNAL_TAIL_KEY)).not.toBeNull();
  });

  it('con vina-last-journal presente al iniciar, esos eventos preceden a session/load y la clave se borra', async () => {
    const journal = await import('../journal');
    journal.pushJournal('gesture', 'down', { button: 0 });
    journal.persistJournalTail();
    journal.clearJournal();

    const { initJournal } = await import('../journalProbes');
    initJournal();

    const { events } = journal.getJournal();
    const downIdx = events.findIndex((e) => e.kind === 'gesture' && e.name === 'down');
    const loadIdx = events.findIndex((e) => e.kind === 'session' && e.name === 'load');
    expect(downIdx).toBeGreaterThanOrEqual(0);
    expect(loadIdx).toBeGreaterThan(downIdx);
    expect(localStorage.getItem(journal.JOURNAL_TAIL_KEY)).toBeNull();
  });

  it('el hook de storage llega como storage/<kind>', async () => {
    let capturedHook: ((ev: { type: string; key: string; store?: string }) => void) | null = null;
    vi.doMock('../../storage', () => ({
      setStorageTelemetryHook: (hook: typeof capturedHook) => { capturedHook = hook; },
    }));

    const { initJournal } = await import('../journalProbes');
    const { getJournal, clearJournal } = await import('../journal');
    initJournal();
    clearJournal();

    expect(capturedHook).toBeTypeOf('function');
    capturedHook!({ type: 'ls-quota-exhausted', key: 'k' });

    const events = getJournal().events.filter((e) => e.kind === 'storage');
    expect(events).toContainEqual(
      expect.objectContaining({ name: 'ls-quota-exhausted', data: { key: 'k', store: undefined } }),
    );
  });

  it('sin soporte de longtask en PerformanceObserver, initJournal no lanza', async () => {
    // Este entorno (Node vía jsdom) expone un PerformanceObserver global sin
    // 'longtask' en supportedEntryTypes — la misma guarda cubre jsdom/Safari
    // puros (constructor ausente del todo).
    expect(
      typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask'),
    ).toBe(true);
    const { initJournal } = await import('../journalProbes');
    expect(() => initJournal()).not.toThrow();
  });
});
