import { persistJournalTail, pushJournal, restoreJournalTail } from './journal';
import { setStorageTelemetryHook } from '../storage';

/**
 * Sondas del navegador de la caja negra: sesión (carga, visibilidad, foco,
 * resize), consola (`console.warn`/`console.error` envueltos), tareas largas
 * del hilo principal y la señal de storage degradado (`idb-unavailable`,
 * `ls-fallback-write`, `ls-quota-exhausted`). Puerta única — la llama
 * `bootstrap.tsx` antes de `initErrorTracker()`.
 *
 * Sin React, sin Redux. Nunca llama a `console`: el envoltorio de abajo es
 * justamente lo que registra los `console.warn`/`console.error` ajenos —
 * que este módulo llamara a `console` sería la recursión que el envoltorio
 * existe para evitar.
 *
 * Spec: docs/superpowers/specs/2026-08-29-caja-negra-bitacora-design.md § 3.6
 */

let _initialized = false;
/** Reentrada del envoltorio de consola: un `pushJournal` que a su vez dispara `console.warn/error` no debe volver a registrarse. */
let registrando = false;

function formatArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'object' && arg !== null) {
    try {
      return JSON.stringify(arg).slice(0, 200);
    } catch {
      // Ciclos u otros valores no serializables: el mensaje pierde detalle,
      // pero el envoltorio nunca debe lanzar por esto.
      return String(arg);
    }
  }
  return String(arg);
}

function wrapConsoleLevel(level: 'warn' | 'error'): void {
  const original = console[level];
  console[level] = (...args: unknown[]) => {
    // Contrato: el original corre SIEMPRE primero, con los args intactos —
    // la usuaria real de la consola no debe notar el envoltorio.
    original.apply(console, args);
    if (registrando) return;
    registrando = true;
    try {
      const message = args.map(formatArg).join(' ').slice(0, 300);
      pushJournal('console', level, { message });
    } catch {
      // El registro de un console.warn/error jamás debe romper la consola real.
    } finally {
      registrando = false;
    }
  };
}

function observeLongTasks(): void {
  if (typeof PerformanceObserver === 'undefined') return;
  if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      pushJournal('perf', 'longtask', { ms: Math.round(entry.duration), name: entry.name });
    }
  });
  observer.observe({ entryTypes: ['longtask'] });
}

/** Instala las sondas del navegador. Idempotente: una segunda llamada no duplica listeners. */
export function initJournal(): void {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;

  restoreJournalTail();
  pushJournal('session', 'load');

  document.addEventListener('visibilitychange', () => {
    pushJournal('session', 'visibility', { state: document.visibilityState });
    if (document.visibilityState === 'hidden') persistJournalTail();
  });
  window.addEventListener('pagehide', () => persistJournalTail());
  window.addEventListener('focus', () => pushJournal('session', 'focus'));
  window.addEventListener('blur', () => pushJournal('session', 'blur'));
  window.addEventListener('resize', () => {
    pushJournal('session', 'resize', { w: window.innerWidth, h: window.innerHeight });
  });

  wrapConsoleLevel('warn');
  wrapConsoleLevel('error');
  observeLongTasks();

  setStorageTelemetryHook((ev) => {
    pushJournal('storage', ev.type, { key: ev.key, store: 'store' in ev ? ev.store : undefined });
  });
}
