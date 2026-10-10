import type { BufferGeometry } from 'three';
import type { SolverTier } from '../../store/simulationSlice';
import type { SolverEdgeData } from './fitMaps';
import { pushJournal } from '../telemetry/journal';

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
  appliedConfig = null;
}

export function getActiveSolverTier(): SolverTier {
  return activeTier;
}

// ─── Config aplicada por tier ───────────────────────────────────────────────

export interface AppliedSolverConfig {
  tier: SolverTier;
  /** Lo que se pasó al initMultiPiece* — tras configBridge, preset de modo y tejido. */
  init: unknown;
  /** Lo aplicado con llamadas posteriores al init (viento, elásticos). */
  postInit: Record<string, unknown>;
}

let appliedConfig: AppliedSolverConfig | null = null;

export function setAppliedSolverConfig(config: AppliedSolverConfig): void {
  appliedConfig = config;
}

export function getAppliedSolverConfig(): AppliedSolverConfig | null {
  return appliedConfig;
}

// ─── Geometría de la tela retenida para la foto física ──────────────────────

export interface MeshManifestEntry {
  pieceId: string;
  vertexOffset: number;
  vertexCount: number;
  triCount: number;
}

export interface ClothGeometryRecord {
  geometry: BufferGeometry;
  manifest: MeshManifestEntry[];
}

let clothGeometry: ClothGeometryRecord | null = null;

/**
 * Sin unregister a propósito: un boundary caído desmonta GarmentSimulation y
 * el fallback exporta DESPUÉS — la referencia tiene que sobrevivir al unmount.
 * La reemplaza la siguiente simulación (o `null` cuando no hay piezas).
 * ponytail: retiene una geometría entre simulaciones; si un perfil de memoria
 * lo acusa, copiar positions al registrar y soltar la geometría.
 */
export function registerClothGeometry(
  geometry: BufferGeometry | null,
  manifest: MeshManifestEntry[],
): void {
  clothGeometry = geometry ? { geometry, manifest } : null;
  // Una tela nueva todavía no se movió: las aristas y los cuadros de la vieja
  // no valen para ella (revisión final IA 1b-2: `fit_map` medía la pose plana).
  aristas = null;
  latidosDeLaTela = 0;
}

export function getClothGeometry(): ClothGeometryRecord | null {
  return clothGeometry;
}

// ─── El latido de la tela (IA 1b-2) ─────────────────────────────────────────

let latidos = 0;
let latidosDeLaTela = 0;
let aristas: SolverEdgeData | null = null;

/**
 * Un cuadro en que la app dibujó tela nueva (el `useFrame` de
 * GarmentSimulation, pasadas sus compuertas). Lo cuenta la superficie para
 * saber si la simulación avanza: con Vina oculta el navegador no dibuja, y el
 * latido se para aunque un worker siga calculando. Lleva las aristas del
 * solver, que el mapa de ajuste por pieza necesita (`fit_map`).
 */
export function latirLaSimulacion(edges: SolverEdgeData | null): void {
  latidos += 1;
  latidosDeLaTela += 1;
  aristas = edges;
}

export function latidosDeLaSimulacion(): number {
  return latidos;
}

/** Los cuadros que avanzó la tela registrada ahora (0 recién montada). */
export function latidosDeEstaTela(): number {
  return latidosDeLaTela;
}

export function aristasDeLaTela(): SolverEdgeData | null {
  return aristas;
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
  // Solo la fila nueva espeja — coalesceSolverEvent actualiza en sitio sin pasar por aquí.
  pushJournal('solver', kind, { generation: eventGeneration });
}

/**
 * Para diagnósticos repetitivos (NaN sostenido en WASM): el último evento del
 * mismo kind+tier+code se actualiza en sitio en vez de inundar el ring.
 */
export function coalesceSolverEvent(
  kind: SolverEventKind,
  data: Record<string, unknown>,
): void {
  const last = events[events.length - 1];
  if (last && last.kind === kind && last.data.tier === data.tier && last.data.code === data.code) {
    last.timestamp = Date.now();
    last.data = data;
    return;
  }
  pushSolverEvent(kind, data);
}

export function getSolverEvents(): readonly SolverEvent[] {
  return events;
}

/** Solo para tests. */
export function clearSolverEvents(): void {
  events.length = 0;
}
