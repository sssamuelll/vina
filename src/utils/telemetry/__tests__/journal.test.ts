/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JOURNAL_COALESCE_MS,
  JOURNAL_MAX,
  JOURNAL_TAIL,
  JOURNAL_TAIL_KEY,
  RESUMIR_MAX_CHARS,
  clearJournal,
  getJournal,
  persistJournalTail,
  pushJournal,
  restoreJournalTail,
  resumir,
} from '../journal';

describe('journal — ring y fusión por clave', () => {
  beforeEach(() => {
    clearJournal();
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it('mantiene solo los últimos JOURNAL_MAX eventos y cuenta los expulsados', () => {
    for (let i = 0; i < JOURNAL_MAX + 3; i++) pushJournal('gesture', `down-${i}`);
    const { events, dropped } = getJournal();
    expect(events).toHaveLength(JOURNAL_MAX);
    expect(dropped).toBe(3);
    expect(events[0].name).toBe('down-3');
  });

  it('funde acciones de la misma clave aunque se alternen (zoom/pan por frame)', () => {
    for (let i = 0; i < 300; i++) {
      pushJournal('action', 'editor/setZoom2D', { payload: 1 + i / 100 });
      pushJournal('action', 'editor/setPan2D', { payload: { x: i, y: 0 } });
      vi.advanceTimersByTime(16);
    }
    const { events } = getJournal();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: 'action', name: 'editor/setZoom2D', n: 300 });
    expect(events[1]).toMatchObject({ kind: 'action', name: 'editor/setPan2D', n: 300, data: { payload: { x: 299, y: 0 } } });
    expect(events[1].tLast).toBe(1_000_000 + 299 * 16);
  });

  it('la ventana de JOURNAL_COALESCE_MS corta la fusión', () => {
    pushJournal('action', 'editor/selectPiece', { payload: 'a' });
    vi.advanceTimersByTime(JOURNAL_COALESCE_MS + 1);
    pushJournal('action', 'editor/selectPiece', { payload: 'b' });
    expect(getJournal().events).toHaveLength(2);
    expect(getJournal().events[0].n).toBeUndefined();
  });

  it('un gesto, un atajo, una superficie o storage nunca se funden', () => {
    pushJournal('gesture', 'down', { button: 0 });
    pushJournal('gesture', 'down', { button: 2 });
    pushJournal('shortcut', 'tool.select');
    pushJournal('shortcut', 'tool.select');
    pushJournal('ui', 'contextmenu');
    pushJournal('ui', 'contextmenu');
    pushJournal('storage', 'autosave');
    pushJournal('storage', 'autosave');
    expect(getJournal().events).toHaveLength(8);
  });

  it('en consola y error la clave lleva el prefijo del mensaje', () => {
    pushJournal('console', 'warn', { message: '[PatternEditor] unfoldPiece failed' });
    pushJournal('console', 'warn', { message: '[PatternEditor] unfoldPiece failed' });
    pushJournal('console', 'warn', { message: '[Viewport3D] device lost' });
    const { events } = getJournal();
    expect(events).toHaveLength(2);
    expect(events[0].n).toBe(2);
  });

  it('al expulsar un evento fundible, su clave deja de fundir', () => {
    pushJournal('action', 'a/first');
    for (let i = 0; i < JOURNAL_MAX; i++) pushJournal('gesture', `g-${i}`);
    expect(getJournal().events[0].name).toBe('g-0');
    pushJournal('action', 'a/first');
    const last = getJournal().events.at(-1)!;
    expect(last).toMatchObject({ name: 'a/first' });
    expect(last.n).toBeUndefined();
  });
});

describe('resumir', () => {
  it('colapsa arrays largos, recorta strings y conserva ids anidados', () => {
    const payload = {
      pieceId: 'p1',
      line: { id: 'l1', type: 'reference', path: Array.from({ length: 40 }, (_, i) => ({ type: 'L', values: [i, i] })) },
      note: 'x'.repeat(100),
      small: [1, 2, 3],
      fn: () => 1,
    };
    expect(resumir(payload)).toEqual({
      pieceId: 'p1',
      line: { id: 'l1', type: 'reference', path: { len: 40 } },
      note: 'x'.repeat(80),
      small: [1, 2, 3],
    });
  });

  it('deja escalares tal cual y undefined como undefined', () => {
    expect(resumir('a')).toBe('a');
    expect(resumir(3)).toBe(3);
    expect(resumir(undefined)).toBeUndefined();
    expect(resumir(null)).toBeNull();
  });

  it('un payload que supera el techo se resume a truncated + claves', () => {
    const big = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 'v'.repeat(50)]));
    const out = resumir(big) as { truncated: boolean; chars: number; keys: string[] };
    expect(out.truncated).toBe(true);
    expect(out.chars).toBeGreaterThan(RESUMIR_MAX_CHARS);
    expect(out.keys).toHaveLength(12);
  });

  it('un payload con ciclo sale como unserializable, no como excepción', () => {
    const cyc: Record<string, unknown> = { id: 'x' };
    cyc.self = cyc;
    expect(resumir(cyc)).toMatchObject({ unserializable: expect.stringContaining('circular') });
  });
});

describe('cola de rescate', () => {
  beforeEach(() => {
    clearJournal();
    localStorage.clear();
  });

  it('persiste los últimos JOURNAL_TAIL eventos y al restaurar los antepone y borra la clave', () => {
    for (let i = 0; i < JOURNAL_TAIL + 10; i++) pushJournal('gesture', `old-${i}`);
    persistJournalTail();
    const raw = localStorage.getItem(JOURNAL_TAIL_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toHaveLength(JOURNAL_TAIL);

    clearJournal();
    pushJournal('action', 'dock/rehydrateDocks');
    expect(restoreJournalTail()).toBe(JOURNAL_TAIL);
    const { events } = getJournal();
    expect(events).toHaveLength(JOURNAL_TAIL + 1);
    expect(events[0].name).toBe('old-10');
    expect(events.at(-1)!.name).toBe('dock/rehydrateDocks');
    expect(localStorage.getItem(JOURNAL_TAIL_KEY)).toBeNull();
  });

  it('una clave corrupta no lanza y no antepone nada', () => {
    localStorage.setItem(JOURNAL_TAIL_KEY, '{not json');
    expect(restoreJournalTail()).toBe(0);
    expect(getJournal().events).toHaveLength(0);
    expect(localStorage.getItem(JOURNAL_TAIL_KEY)).toBeNull();
  });
});
