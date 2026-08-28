import type { SolverTier } from '../../store/simulationSlice';

/**
 * Hechos del runtime del solver que Redux no guarda: el tier realmente
 * activo, y (caja negra 3D) el ring de eventos de la cascada. Módulo sin
 * React ni Redux — lo leen el exporter de diagnóstico y los tests.
 */

let activeTier: SolverTier = 'none';

export function setActiveSolverTier(
  tier: Exclude<SolverTier, 'none'>,
): void {
  activeTier = tier;
}

export function clearActiveSolverTier(): void {
  activeTier = 'none';
}

export function getActiveSolverTier(): SolverTier {
  return activeTier;
}

// ─── Ring de eventos de la cascada ──────────────────────────────────────────

export type SolverEventKind =
  | 'cascade:start'
  | 'tier:skipped'
  | 'tier:selected'
  | 'tier:failed'
  | 'tier:runtime-error'
  | 'tier:diagnostic'
  | 'device:lost'
  | 'nan:detected'
  | 'nan:solver-stopped'
  | 'collision:degraded'
  | 'meshing:piece-failed'
  | 'start:failed';

export interface SolverEvent {
  kind: SolverEventKind;
  timestamp: number;
  /** Corrida de la cascada a la que pertenece (ver `beginCascade`). */
  generation: number;
  data: Record<string, unknown>;
}

export const SOLVER_EVENTS_MAX = 200;

const events: SolverEvent[] = [];
let generation = 0;

/** Cada corrida de la cascada (Play, Stop→Play, pérdida de device) abre una generación. */
export function beginCascade(): number {
  generation += 1;
  return generation;
}

export function currentCascadeGeneration(): number {
  return generation;
}

/**
 * Log de sesión: siempre encendido, en memoria, cap 200. No se limpia por
 * proyecto — `generation` + `timestamp` distinguen corridas.
 */
export function pushSolverEvent(
  kind: SolverEventKind,
  data: Record<string, unknown> = {},
  eventGeneration: number = generation,
): void {
  events.push({ kind, timestamp: Date.now(), generation: eventGeneration, data });
  if (events.length > SOLVER_EVENTS_MAX) events.shift();
}

export function getSolverEvents(): readonly SolverEvent[] {
  return events;
}

/** Solo para tests. */
export function clearSolverEvents(): void {
  events.length = 0;
}
