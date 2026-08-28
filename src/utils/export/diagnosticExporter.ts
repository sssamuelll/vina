import type { RootState } from '../../store';
import { DebugStore } from '../../copilot/debug/DebugStore';
import { isDebugEnabled } from '../../copilot/debug/createDebugBridge';
import { getToolExecutions } from '../../copilot/debug/toolExecutionTracker';
import { getHistory } from '../../store/undoMiddleware';
import {
  getActiveSolverTier,
  getAppliedSolverConfig,
  getClothGeometry,
  getSolverEvents,
  type ClothGeometryRecord,
  type MeshManifestEntry,
} from '../cloth/solverRuntimeTracker';
import { getTrackedErrors, pushError } from '../errorTracker';
import { downloadBlob } from './turntableRenderer';

// ─── Foto física de la tela ─────────────────────────────────────────────────

/** ponytail: techo fijo; si un bundle real lo pisa, decidir entonces. */
export const CLOTH_SNAPSHOT_MAX_VERTICES = 100_000;

export interface ClothSnapshot {
  vertexCount: number;
  /** Float32 little-endian, base64 — una cadena, no 300 000 números indentados. */
  encoding: 'float32-base64';
  positions: string | null;
  positionsOmitted: boolean;
  /** `vertexCount` no coincide con la suma del manifiesto: no cortar por pieza. */
  manifestMismatch: boolean;
}

export function float32ToBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let binary = '';
  const CHUNK = 0x8000; // String.fromCharCode con spread revienta la pila por encima de esto
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

export function base64ToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function snapshotOf(record: ClothGeometryRecord | null): ClothSnapshot | null {
  if (!record) return null;
  const array = record.geometry.attributes.position?.array as ArrayLike<number> | undefined;
  if (!array) return null;
  const vertexCount = array.length / 3;
  const manifestTotal = record.manifest.reduce((sum, m) => sum + m.vertexCount, 0);
  const omit = vertexCount > CLOTH_SNAPSHOT_MAX_VERTICES;
  return {
    vertexCount,
    encoding: 'float32-base64',
    positions: omit ? null : float32ToBase64(array instanceof Float32Array ? array : Float32Array.from(array)),
    positionsOmitted: omit,
    manifestMismatch: vertexCount !== manifestTotal,
  };
}

type DiagnosticState = Pick<
  RootState,
  'project' | 'avatar' | 'simulation' | 'inspector'
>;

export interface DiagnosticSources {
  getHistory: typeof getHistory;
  getTrackedErrors: typeof getTrackedErrors;
  getToolExecutions: typeof getToolExecutions;
  getActiveSolverTier: typeof getActiveSolverTier;
  getSolverEvents: typeof getSolverEvents;
  getAppliedSolverConfig: typeof getAppliedSolverConfig;
  getClothGeometry: typeof getClothGeometry;
  isDebugEnabled: typeof isDebugEnabled;
  getDebugRecords: () => ReturnType<DebugStore['getAll']>;
}

export interface DiagnosticBundle {
  exportedAt: string;
  project: RootState['project'];
  avatar: RootState['avatar'];
  simulation: RootState['simulation'];
  solver: {
    activeTier: ReturnType<typeof getActiveSolverTier>;
    lastSelectedTier: RootState['simulation']['solverTier'];
    /** Ring de la cascada: qué tier corrió, cuáles se saltaron y por qué, errores por corrida. */
    events: ReturnType<typeof getSolverEvents>;
    /** Lo que el solver recibió de verdad (tras configBridge, preset y tejido), no lo que Redux guarda. */
    appliedConfig: ReturnType<typeof getAppliedSolverConfig>;
    /** Desglose por pieza de la geometría renderizada — corta `clothSnapshot.positions`. */
    meshManifest: MeshManifestEntry[] | null;
    /**
     * Posiciones de la geometría renderizada al exportar (≤15 frames de
     * retraso en el tier GPU; sin velocidades — ningún tier las expone).
     */
    clothSnapshot: ClothSnapshot | null;
  };
  inspector: Pick<
    RootState['inspector'],
    'lastSolverError' | 'seamResolutionErrors'
  >;
  history: ReturnType<typeof getHistory>;
  errors: ReturnType<typeof getTrackedErrors>;
  toolExecutions: ReturnType<typeof getToolExecutions>;
  agentDebugRecords: ReturnType<DebugStore['getAll']>;
}

const browserSources: DiagnosticSources = {
  getHistory,
  getTrackedErrors,
  getToolExecutions,
  getActiveSolverTier,
  getSolverEvents,
  getAppliedSolverConfig,
  getClothGeometry,
  isDebugEnabled,
  getDebugRecords: () => new DebugStore().getAll(),
};

export function buildDiagnosticBundle(
  state: DiagnosticState,
  exportedAt = new Date().toISOString(),
  sources: DiagnosticSources = browserSources,
): DiagnosticBundle {
  const debugEnabled = sources.isDebugEnabled();
  return {
    exportedAt,
    project: state.project,
    avatar: state.avatar,
    simulation: state.simulation,
    solver: {
      activeTier: sources.getActiveSolverTier(),
      lastSelectedTier: state.simulation.solverTier,
      events: sources.getSolverEvents(),
      appliedConfig: sources.getAppliedSolverConfig(),
      meshManifest: sources.getClothGeometry()?.manifest ?? null,
      clothSnapshot: snapshotOf(sources.getClothGeometry()),
    },
    inspector: {
      lastSolverError: state.inspector.lastSolverError,
      seamResolutionErrors: state.inspector.seamResolutionErrors,
    },
    history: sources.getHistory(),
    errors: sources.getTrackedErrors(),
    toolExecutions: sources.getToolExecutions(),
    agentDebugRecords: debugEnabled ? sources.getDebugRecords() : [],
  };
}

export function downloadDiagnosticBundle(
  state: DiagnosticState,
  sources: DiagnosticSources = browserSources,
): void {
  let bundle: DiagnosticBundle;
  let json: string;
  try {
    bundle = buildDiagnosticBundle(state, undefined, sources);
    json = JSON.stringify(bundle, null, 2);
  } catch (e) {
    // El botón vive en el fallback de un boundary caído: ningún boundary
    // atrapa un throw de este onClick. Reintento sin la parte pesada y
    // registro del fallo para que el propio bundle lo cuente.
    pushError({
      message: `Exportación sin foto: ${e instanceof Error ? e.message : String(e)}`,
      source: 'diagnosticExporter',
      timestamp: Date.now(),
    });
    bundle = buildDiagnosticBundle(state, undefined, { ...sources, getClothGeometry: () => null });
    json = JSON.stringify(bundle, null, 2);
  }
  const safeTimestamp = bundle.exportedAt.replace(/[:.]/g, '-');
  downloadBlob(
    new Blob([json], { type: 'application/json' }),
    `vina-diagnostico-${safeTimestamp}.json`,
  );
}
