/**
 * Simulation Tools — fabric assignment and cloth simulation control.
 * Herramientas de Simulación — asignación de tela y control de simulación de tela.
 *
 * @module simulationTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import {
  setFabric as setFabricAction,
  setDefaultFabric,
  startSimulation as startSimAction,
  pauseSimulation as pauseSimAction,
  resetSimulation,
  setFitMapMode,
  updateFitMapConfig,
  addSnapshot,
  removeSnapshot,
  setActiveSnapshot,
} from '../../../../store/simulationSlice';
import { updatePiece } from '../../../../store/projectSlice';
import type { FitMapMode } from '../../../../utils/cloth/fitMaps';
import type { InterfacingType } from '../../../../types/types';
import { FABRIC_LIBRARY } from '../../../../utils/cloth/fabricLibrary';
import { computeStiffnessMultiplier } from '../../../../utils/cloth/interfacing';

// ─── setFabric ──────────────────────────────────────────────────────────────

const setFabricTool: ToolDefinition = {
  name: 'setFabric',
  description:
    'Assign a fabric material to a piece or set the default fabric for all pieces. ' +
    '/ Asignar un material de tela a una pieza o establecer la tela predeterminada para todas las piezas.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: "Piece ID, or 'default' for all new pieces / ID de la pieza, o 'default' para nuevas piezas" },
      fabricId: {
        type: 'string',
        enum: ['cotton-poplin', 'denim', 'silk-charmeuse', 'wool-crepe', 'jersey-knit', 'organza', 'linen', 'neoprene', 'chiffon', 'canvas'],
        description: 'Built-in fabric ID / ID de tela incorporada',
      },
    },
    required: ['pieceId', 'fabricId'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    const pieceId = params.pieceId as string;
    const fabricId = params.fabricId as string;

    const fabric = FABRIC_LIBRARY[fabricId];
    if (!fabric) {
      return { success: false, error: `Fabric "${fabricId}" not found` };
    }

    if (pieceId === 'default') {
      dispatch(setDefaultFabric(fabricId));
    } else {
      dispatch(setFabricAction({ pieceId, fabricId }));
    }

    return {
      success: true,
      data: {
        fabricName: fabric.name,
        properties: {
          weight: fabric.weight,
          stretchStiffness: fabric.stretchStiffness,
          bendStiffness: fabric.bendStiffness,
          friction: fabric.friction,
          thickness: fabric.thickness,
        },
      },
    };
  },
};

// ─── listFabrics ────────────────────────────────────────────────────────────

const listFabricsTool: ToolDefinition = {
  name: 'listFabrics',
  description:
    'List all available fabrics with their physical properties. ' +
    '/ Listar todas las telas disponibles con sus propiedades físicas.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (): Promise<ToolResult> => {
    const fabrics = Object.entries(FABRIC_LIBRARY).map(([id, mat]) => ({
      id,
      name: mat.name,
      weight: mat.weight,
      stretchStiffness: mat.stretchStiffness,
      bendStiffness: mat.bendStiffness,
      thickness: mat.thickness,
    }));

    return { success: true, data: { fabrics } };
  },
};

// ─── startSimulation ────────────────────────────────────────────────────────

const startSimulationTool: ToolDefinition = {
  name: 'startSimulation',
  description:
    'Start the 3D cloth drape simulation. / Iniciar la simulación de caída de tela 3D.',
  parameters: {
    type: 'object',
    properties: {
      reset: { type: 'boolean', description: 'Reset cloth to initial position before starting / Reiniciar tela a posición inicial' },
    },
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    if (params.reset) {
      dispatch(resetSimulation());
    }
    dispatch(startSimAction());
    return { success: true };
  },
};

// ─── pauseSimulation ────────────────────────────────────────────────────────

const pauseSimulationTool: ToolDefinition = {
  name: 'pauseSimulation',
  description:
    'Pause the cloth simulation. / Pausar la simulación de tela.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, dispatch): Promise<ToolResult> => {
    dispatch(pauseSimAction());
    return { success: true };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

// ─── setFitMapMode ──────────────────────────────────────────────────────────

const setFitMapModeTool: ToolDefinition = {
  name: 'setFitMapMode',
  description:
    'Toggle garment fit map visualization (CLO3D-style). Shows stress, strain, fit, or pressure overlay on the simulated garment. ' +
    '/ Alternar visualización de mapa de ajuste (estilo CLO3D). Muestra estrés, deformación, ajuste o presión.',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['none', 'stress', 'strain', 'fit', 'pressure'],
        description:
          'none=off, stress=kPa pressure, strain=% stretch, fit=% of max distortion, pressure=avatar contact points',
      },
    },
    required: ['mode'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    const mode = params.mode as FitMapMode;
    dispatch(setFitMapMode(mode));
    const descriptions: Record<string, string> = {
      none: 'Fit map visualization disabled',
      stress: 'Stress Map: force per unit area (kPa). Blue=0, Red=100kPa',
      strain: 'Strain Map: % elongation. Blue=100% (rest), Red=120%',
      fit: 'Fit Map: % of max fabric distortion. White=OK, Yellow=Tight(>80%), Red=Can\'t Wear(>100%)',
      pressure: 'Pressure Points: avatar-garment contact visualization',
    };
    return { success: true, data: { mode, description: descriptions[mode] } };
  },
};

// ─── configureFitMap ────────────────────────────────────────────────────────

const configureFitMapTool: ToolDefinition = {
  name: 'configureFitMap',
  description:
    'Adjust fit map visualization ranges and thresholds (CLO3D "Garment Fit Properties"). ' +
    '/ Ajustar rangos y umbrales de visualización del mapa de ajuste.',
  parameters: {
    type: 'object',
    properties: {
      stressMax: { type: 'number', description: 'Max stress range in kPa (default 100)' },
      strainMax: { type: 'number', description: 'Max strain range as ratio (default 1.2 = 120%)' },
      tightThreshold: { type: 'number', description: 'Tight fit threshold as fraction of max (default 0.8)' },
      cantWearThreshold: { type: 'number', description: "Can't wear threshold (default 1.0)" },
      pressureDistance: { type: 'number', description: 'Contact distance in meters (default 0.002)' },
    },
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    const patch: Record<string, unknown> = {};
    if (params.stressMax !== undefined) patch.stressRange = [0, params.stressMax as number];
    if (params.strainMax !== undefined) patch.strainRange = [1.0, params.strainMax as number];
    if (params.tightThreshold !== undefined || params.cantWearThreshold !== undefined) {
      patch.fitThresholds = [
        (params.tightThreshold as number) ?? 0.8,
        (params.cantWearThreshold as number) ?? 1.0,
      ];
    }
    if (params.pressureDistance !== undefined) patch.pressureDistance = params.pressureDistance;
    dispatch(updateFitMapConfig(patch));
    return { success: true, data: { updated: Object.keys(patch) } };
  },
};

// ─── saveSimulationState ────────────────────────────────────────────────────

const saveSimulationStateTool: ToolDefinition = {
  name: 'saveSimulationState',
  description:
    'Save the current 3D draping state as a named snapshot for later comparison. ' +
    '/ Guardar el estado actual de caída 3D como snapshot con nombre.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Human-readable name for this state / Nombre legible para este estado' },
    },
    required: ['name'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const name = params.name as string;
    const id = `copilot-${Date.now()}`;
    const state = getState();
    const particleCount = state.simulation.particleCount ?? 0;

    dispatch(addSnapshot({ id, name, particleCount, isAutoSave: false }));
    dispatch(setActiveSnapshot(id));

    // Emit custom event for GarmentSimulation to pick up
    window.dispatchEvent(new CustomEvent('openclo:snapshotSave', { detail: { id } }));

    return { success: true, data: { id, name, particleCount } };
  },
};

// ─── restoreSimulationState ─────────────────────────────────────────────────

const restoreSimulationStateTool: ToolDefinition = {
  name: 'restoreSimulationState',
  description:
    'Restore a previously saved draping state by name. ' +
    '/ Restaurar un estado de caída guardado previamente por nombre.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the saved state / Nombre del estado guardado' },
    },
    required: ['name'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const name = params.name as string;
    const state = getState();
    const snapshots = state.simulation.snapshots ?? [];
    const snap = snapshots.find((s: { name: string }) => s.name === name);
    if (!snap) {
      return { success: false, error: `No snapshot named "${name}" found` };
    }

    dispatch(setActiveSnapshot(snap.id));
    window.dispatchEvent(new CustomEvent('openclo:snapshotRestore', { detail: { id: snap.id } }));

    return { success: true, data: { restored: true, name: snap.name } };
  },
};

// ─── listSimulationStates ───────────────────────────────────────────────────

const listSimulationStatesTool: ToolDefinition = {
  name: 'listSimulationStates',
  description:
    'List all saved simulation state snapshots. ' +
    '/ Listar todos los snapshots de estado de simulación guardados.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const snapshots = state.simulation.snapshots ?? [];
    return {
      success: true,
      data: {
        snapshots: snapshots
          .filter((s: { isAutoSave: boolean }) => !s.isAutoSave)
          .map((s: { id: string; name: string; timestamp: number; particleCount: number }) => ({
            id: s.id,
            name: s.name,
            timestamp: s.timestamp,
            particleCount: s.particleCount,
          })),
      },
    };
  },
};

// ─── deleteSimulationState ──────────────────────────────────────────────────

const deleteSimulationStateTool: ToolDefinition = {
  name: 'deleteSimulationState',
  description:
    'Delete a saved simulation state snapshot by name. ' +
    '/ Eliminar un snapshot de estado de simulación por nombre.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the state to delete / Nombre del estado a eliminar' },
    },
    required: ['name'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const name = params.name as string;
    const state = getState();
    const snapshots = state.simulation.snapshots ?? [];
    const snap = snapshots.find((s: { name: string }) => s.name === name);
    if (!snap) {
      return { success: false, error: `No snapshot named "${name}" found` };
    }

    dispatch(removeSnapshot(snap.id));
    window.dispatchEvent(new CustomEvent('openclo:snapshotDelete', { detail: { id: snap.id } }));

    return { success: true, data: { deleted: true, name } };
  },
};

// ─── setInterfacing ────────────────────────────────────────────────────────

const VALID_INTERFACING: InterfacingType[] = [
  'none', 'fusible-light', 'fusible-medium', 'fusible-heavy',
  'sew-in-light', 'sew-in-heavy', 'canvas',
];

const setInterfacingTool: ToolDefinition = {
  name: 'setInterfacing',
  description:
    'Set the interfacing type for a pattern piece. Interfacing stiffens the fabric for structural support. ' +
    '/ Establecer el tipo de entretela para una pieza de patrón. La entretela rigidiza la tela para soporte estructural.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece / ID de la pieza' },
      interfacingType: {
        type: 'string',
        enum: VALID_INTERFACING,
        description: 'Interfacing type / Tipo de entretela',
      },
    },
    required: ['pieceId', 'interfacingType'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const pieceId = params.pieceId as string;
    const interfacingType = params.interfacingType as InterfacingType;
    const piece = getState().project.pieces.find((p: { id: string }) => p.id === pieceId);
    if (!piece) return { success: false, error: `Piece "${pieceId}" not found` };
    if (!VALID_INTERFACING.includes(interfacingType)) {
      return { success: false, error: `Invalid interfacing type "${interfacingType}"` };
    }
    dispatch(updatePiece({ ...piece, interfacingType, updatedAt: Date.now() }));
    const multiplier = computeStiffnessMultiplier(interfacingType, piece.solidifyFactor);
    return { success: true, data: { pieceId, interfacingType, stiffnessMultiplier: multiplier } };
  },
};

// ─── setSolidify ───────────────────────────────────────────────────────────

const setSolidifyTool: ToolDefinition = {
  name: 'setSolidify',
  description:
    'Set the solidify factor (0–1) for a pattern piece. Solidify adds extra stiffness beyond interfacing. ' +
    '/ Establecer el factor de solidificación (0–1) para una pieza. Solidificar añade rigidez extra más allá de la entretela.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece / ID de la pieza' },
      solidifyFactor: {
        type: 'number',
        description: 'Solidify factor 0–1 (0 = none, 1 = maximum stiffness) / Factor de solidificación 0–1',
      },
    },
    required: ['pieceId', 'solidifyFactor'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const pieceId = params.pieceId as string;
    const raw = params.solidifyFactor as number;
    const solidifyFactor = Math.max(0, Math.min(1, raw));
    const piece = getState().project.pieces.find((p: { id: string }) => p.id === pieceId);
    if (!piece) return { success: false, error: `Piece "${pieceId}" not found` };
    dispatch(updatePiece({ ...piece, solidifyFactor, updatedAt: Date.now() }));
    const multiplier = computeStiffnessMultiplier(piece.interfacingType, solidifyFactor);
    return { success: true, data: { pieceId, solidifyFactor, stiffnessMultiplier: multiplier } };
  },
};

// ─── getSimulationProperties ───────────────────────────────────────────────

const getSimulationPropertiesTool: ToolDefinition = {
  name: 'getSimulationProperties',
  description:
    'Get simulation-related properties (fabric, interfacing, solidify, effective stiffness) for one or all pieces. ' +
    '/ Obtener propiedades de simulación (tela, entretela, solidificación, rigidez efectiva) para una o todas las piezas.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Optional piece ID; omit for all pieces / ID de pieza opcional; omitir para todas' },
    },
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const pieces = state.project.pieces;
    const targetId = params.pieceId as string | undefined;

    const targets = targetId
      ? pieces.filter((p: { id: string }) => p.id === targetId)
      : pieces;

    if (targetId && targets.length === 0) {
      return { success: false, error: `Piece "${targetId}" not found` };
    }

    const result = targets.map((p: {
      id: string; name: string; fabricId?: string;
      interfacingType?: InterfacingType; solidifyFactor?: number;
    }) => ({
      pieceId: p.id,
      name: p.name,
      fabricId: p.fabricId ?? null,
      interfacingType: p.interfacingType ?? 'none',
      solidifyFactor: p.solidifyFactor ?? 0,
      stiffnessMultiplier: computeStiffnessMultiplier(
        (p.interfacingType as InterfacingType) ?? 'none',
        p.solidifyFactor ?? 0,
      ),
    }));

    return { success: true, data: { pieces: result } };
  },
};

export const tools: ToolDefinition[] = [
  setFabricTool,
  listFabricsTool,
  startSimulationTool,
  pauseSimulationTool,
  setFitMapModeTool,
  configureFitMapTool,
  saveSimulationStateTool,
  restoreSimulationStateTool,
  listSimulationStatesTool,
  deleteSimulationStateTool,
  setInterfacingTool,
  setSolidifyTool,
  getSimulationPropertiesTool,
];
