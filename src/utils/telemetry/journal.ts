import { safeGetItem, safeRemoveItem, safeSetItem } from '../safeStorage';

/**
 * La bitácora de la caja negra: un ring en memoria, siempre encendido, con
 * todo lo que pasa dentro de Vina — gestos 2D, acciones, atajos, menús,
 * consola, sesión, storage, errores, solver — en una sola línea de tiempo.
 * Las sondas viven en las puertas (middleware, router 2D, ShortcutProvider,
 * `initJournal`) y llaman `pushJournal` con escalares. Sin React, sin Redux,
 * sin `console` (el envoltorio de consola registra aquí: llamar a `console`
 * desde este módulo sería recursión).
 *
 * Spec: docs/superpowers/specs/2026-08-29-caja-negra-bitacora-design.md
 */

export type JournalKind =
  | 'gesture'
  | 'action'
  | 'shortcut'
  | 'ui'
  | 'console'
  | 'perf'
  | 'session'
  | 'storage'
  | 'error'
  | 'solver';

export interface JournalEvent {
  /** `Date.now()` — misma base que los rings existentes. */
  t: number;
  kind: JournalKind;
  name: string;
  /** Escalares, o el resultado de `resumir` (ya pasó por JSON). Nunca referencias vivas. */
  data?: Record<string, unknown>;
  /** Presente solo si ≥ 2 eventos se fundieron en este. */
  n?: number;
  /** `t` del último fundido. */
  tLast?: number;
}

export const JOURNAL_MAX = 1000;
export const JOURNAL_TAIL = 150;
export const JOURNAL_COALESCE_MS = 1000;
export const JOURNAL_TAIL_KEY = 'vina-last-journal';
export const RESUMIR_MAX_CHARS = 600;

/** Un gesto, un atajo, una superficie o un evento de storage repetido es información, no ruido. */
const UNFUSED: ReadonlySet<JournalKind> = new Set(['gesture', 'shortcut', 'ui', 'storage']);

const events: JournalEvent[] = [];
let dropped = 0;
/** Último evento vivo por clave — la fusión es por clave, no consecutiva (spec § 2.1). */
const lastByKey = new Map<string, JournalEvent>();

function keyOf(ev: JournalEvent): string {
  const base = `${ev.kind}/${ev.name}`;
  if (ev.kind === 'console' || ev.kind === 'error') {
    const message = ev.data?.message;
    return `${base}/${typeof message === 'string' ? message.slice(0, 40) : ''}`;
  }
  return base;
}

function expelOldest(): void {
  const old = events.shift();
  if (!old) return;
  dropped += 1;
  const key = keyOf(old);
  if (lastByKey.get(key) === old) lastByKey.delete(key);
}

export function pushJournal(
  kind: JournalKind,
  name: string,
  data?: Record<string, unknown>,
): void {
  const now = Date.now();
  const ev: JournalEvent = data ? { t: now, kind, name, data } : { t: now, kind, name };
  if (!UNFUSED.has(kind)) {
    const key = keyOf(ev);
    const prev = lastByKey.get(key);
    if (prev && now - (prev.tLast ?? prev.t) <= JOURNAL_COALESCE_MS) {
      prev.n = (prev.n ?? 1) + 1;
      prev.tLast = now;
      if (data) prev.data = data;
      return;
    }
    lastByKey.set(key, ev);
  }
  events.push(ev);
  if (events.length > JOURNAL_MAX) expelOldest();
}

export function getJournal(): { events: readonly JournalEvent[]; dropped: number } {
  return { events, dropped };
}

export function clearJournal(): void {
  events.length = 0;
  dropped = 0;
  lastByKey.clear();
}

// ─── Resumen de payloads Redux ──────────────────────────────────────────────

function replacer(_key: string, value: unknown): unknown {
  if (Array.isArray(value) && value.length > 8) return { len: value.length };
  if (typeof value === 'string' && value.length > 80) return value.slice(0, 80);
  return value;
}

/**
 * Un `replacer` de `JSON.stringify` y un techo: arrays > 8 → `{ len }`,
 * strings > 80 recortados, funciones/símbolos fuera. El resultado es JSON por
 * construcción (sin ciclos posibles en `data`).
 */
export function resumir(payload: unknown): unknown {
  if (payload === undefined) return undefined;
  let s: string | undefined;
  try {
    s = JSON.stringify(payload, replacer);
  } catch (e) {
    return { unserializable: e instanceof Error ? e.message : String(e) };
  }
  if (s === undefined) return undefined;
  if (s.length > RESUMIR_MAX_CHARS) {
    const keys = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 12) : [];
    return { truncated: true, chars: s.length, keys };
  }
  return JSON.parse(s) as unknown;
}

// ─── Cola de rescate (spec § 5) ─────────────────────────────────────────────

function isJournalEvent(x: unknown): x is JournalEvent {
  return typeof x === 'object' && x !== null
    && typeof (x as JournalEvent).t === 'number'
    && typeof (x as JournalEvent).kind === 'string'
    && typeof (x as JournalEvent).name === 'string';
}

/** La llama `initJournal` en `pagehide` y al ocultarse la pestaña. */
export function persistJournalTail(): void {
  try {
    // LS-only: se escribe mientras la página se va; es síncrono e IDB no llega a tiempo.
    safeSetItem(JOURNAL_TAIL_KEY, JSON.stringify(events.slice(-JOURNAL_TAIL)));
  } catch {
    // La bitácora nunca rompe la salida de la página.
  }
}

/** Lee la cola de la sesión anterior, borra la clave y la antepone al ring. Devuelve cuántos entraron. */
export function restoreJournalTail(): number {
  const raw = safeGetItem(JOURNAL_TAIL_KEY);
  if (!raw) return 0;
  // LS-only: borra la misma ranura síncrona; no existe copia IDB paralela.
  safeRemoveItem(JOURNAL_TAIL_KEY);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!Array.isArray(parsed)) return 0;
  const previous = parsed.filter(isJournalEvent).slice(-JOURNAL_TAIL);
  events.unshift(...previous);
  while (events.length > JOURNAL_MAX) expelOldest();
  return previous.length;
}
