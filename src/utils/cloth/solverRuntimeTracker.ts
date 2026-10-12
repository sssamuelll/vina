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
  tierDeLaTela = 'none';
}

export function getClothGeometry(): ClothGeometryRecord | null {
  return clothGeometry;
}

// ─── El latido de la tela (IA 1b-2) ─────────────────────────────────────────

let latidos = 0;
let latidosDeLaTela = 0;
let aristas: SolverEdgeData | null = null;
/** El tier que movió la tela en su último latido: parar libera el solver y el activo vuelve a 'none'. */
let tierDeLaTela: SolverTier = 'none';

/**
 * Un cuadro en que la app dibujó tela nueva (el `useFrame` de
 * GarmentSimulation, pasadas sus compuertas). Lo cuenta la superficie para
 * saber si la simulación avanza: con Vina oculta el navegador no dibuja, y el
 * latido se para aunque un worker siga calculando. Lleva las aristas del
 * solver, que el mapa de ajuste por pieza necesita (`fit_map`).
 *
 * Devuelve `true` solo en el primer latido de la corrida. No lo marca en la
 * caja negra: en WebGPU ese cuadro apenas se envió y todavía no se ve. Lo marca
 * `marcarPrimerCuadro`, que llama quien sabe cuándo se ve.
 */
export function latirLaSimulacion(edges: SolverEdgeData | null): boolean {
  latidos += 1;
  latidosDeLaTela += 1;
  aristas = edges;
  tierDeLaTela = activeTier;
  latidosDeLaCorrida += 1;
  return latidosDeLaCorrida === 1;
}

/**
 * El primer cuadro de la corrida, ya en pantalla: queda en la caja negra como
 * `tela:primer-cuadro`, con los ms desde su `beginCascade` y lo que traiga
 * `datos` (en WebGPU, `gpuMs`: lo que tardó la GPU en terminarlo).
 */
export function marcarPrimerCuadro(datos?: Record<string, unknown>): void {
  pushSolverEvent('tela:primer-cuadro', { ms: Date.now() - inicioDeLaCorrida, ...datos });
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

export function tierDeEstaTela(): SolverTier {
  return tierDeLaTela;
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
  | 'start:failed'
  | 'tela:primer-cuadro'
  | 'preparar:listo'
  | 'preparar:fallo'
  | 'preparar:usada';

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
/** Cuándo empezó la corrida viva (`marcarPrimerCuadro` mide desde ahí) y cuántos latidos lleva. */
let inicioDeLaCorrida = 0;
let latidosDeLaCorrida = 0;

/** Cada corrida de la cascada (Play, Stop→Play, pérdida de device) abre una generación. */
export function beginCascade(): number {
  generation += 1;
  inicioDeLaCorrida = Date.now();
  latidosDeLaCorrida = 0;
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

/**
 * Para lo que se repite en reposo: el preparador avisa `preparar:listo` tras
 * cada pausa de la edición, y una tarde editando en Split llenaba el ring y
 * desalojaba los eventos de la cascada. El evento nuevo reemplaza a los
 * anteriores del mismo kind y la misma `data.fase`, y entra al final: queda
 * uno por fase, el último. Lleva la generación 0, la de ninguna cascada
 * (`beginCascade` empieza en 1): lo que se prepara en reposo no es parte de la
 * corrida anterior.
 */
export function reemplazarEventoDeLaFase(kind: SolverEventKind, data: Record<string, unknown>): void {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === kind && events[i].data.fase === data.fase) events.splice(i, 1);
  }
  pushSolverEvent(kind, data, 0);
}

export function getSolverEvents(): readonly SolverEvent[] {
  return events;
}

/** Solo para tests. */
export function clearSolverEvents(): void {
  events.length = 0;
}
