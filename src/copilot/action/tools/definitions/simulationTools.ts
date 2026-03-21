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
  toggleHide3D,
  showAll3D,
  hideAll3D,
  toggleFlipNormal,
} from '../../../../store/simulationSlice';
import { updatePiece, setArrangement3D, clearArrangementOverrides } from '../../../../store/projectSlice';
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
    const prev = { interfacingType: piece.interfacingType, solidifyFactor: piece.solidifyFactor };
    dispatch(updatePiece({ ...piece, interfacingType, updatedAt: Date.now() }));
    const multiplier = computeStiffnessMultiplier(interfacingType, piece.solidifyFactor);
    return {
      success: true,
      data: { pieceId, interfacingType, stiffnessMultiplier: multiplier },
      rollback: () => dispatch(updatePiece({ ...piece, ...prev, updatedAt: Date.now() })),
    };
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
    const raw = params.solidifyFactor;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { success: false, error: 'solidifyFactor must be a valid number' };
    }
    const solidifyFactor = Math.max(0, Math.min(1, raw));
    const piece = getState().project.pieces.find((p: { id: string }) => p.id === pieceId);
    if (!piece) return { success: false, error: `Piece "${pieceId}" not found` };
    const prev = { interfacingType: piece.interfacingType, solidifyFactor: piece.solidifyFactor };
    dispatch(updatePiece({ ...piece, solidifyFactor, updatedAt: Date.now() }));
    const multiplier = computeStiffnessMultiplier(piece.interfacingType, solidifyFactor);
    return {
      success: true,
      data: { pieceId, solidifyFactor, stiffnessMultiplier: multiplier },
      rollback: () => dispatch(updatePiece({ ...piece, ...prev, updatedAt: Date.now() })),
    };
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

// ─── hide3DPiece ────────────────────────────────────────────────────────────

const hide3DPieceTool: ToolDefinition = {
  name: 'hide3DPiece',
  description:
    'Hide a pattern piece in the 3D viewport (toggle). The piece is excluded from rendering but can be shown again. ' +
    '/ Ocultar una pieza de patrón en la vista 3D (alternar). La pieza se excluye del renderizado pero puede mostrarse de nuevo.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece to hide / ID de la pieza a ocultar' },
    },
    required: ['pieceId'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const pieceId = params.pieceId as string;
    const piece = getState().project.pieces.find((p: { id: string }) => p.id === pieceId);
    if (!piece) return { success: false, error: `Piece "${pieceId}" not found` };
    dispatch(toggleHide3D(pieceId));
    const isNowHidden = getState().simulation.hiddenPieceIds.includes(pieceId);
    return {
      success: true,
      data: { pieceId, hidden: isNowHidden },
      rollback: () => dispatch(toggleHide3D(pieceId)),
    };
  },
};

// ─── show3DPiece ────────────────────────────────────────────────────────────

const show3DPieceTool: ToolDefinition = {
  name: 'show3DPiece',
  description:
    'Show a hidden piece in the 3D viewport (toggle), or show all pieces if pieceId is "all". ' +
    '/ Mostrar una pieza oculta en la vista 3D (alternar), o mostrar todas si pieceId es "all".',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece to show, or "all" / ID de la pieza a mostrar, o "all"' },
    },
    required: ['pieceId'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const pieceId = params.pieceId as string;
    if (pieceId === 'all') {
      const prevHidden = [...getState().simulation.hiddenPieceIds];
      dispatch(showAll3D());
      return {
        success: true,
        data: { showedAll: true },
        rollback: () => dispatch(hideAll3D(prevHidden)),
      };
    }
    const piece = getState().project.pieces.find((p: { id: string }) => p.id === pieceId);
    if (!piece) return { success: false, error: `Piece "${pieceId}" not found` };
    const wasHidden = getState().simulation.hiddenPieceIds.includes(pieceId);
    if (wasHidden) {
      dispatch(toggleHide3D(pieceId));
    }
    return {
      success: true,
      data: { pieceId, hidden: false },
      rollback: () => { if (wasHidden) dispatch(toggleHide3D(pieceId)); },
    };
  },
};

// ─── showAll3DPieces ────────────────────────────────────────────────────────

const showAll3DPiecesTool: ToolDefinition = {
  name: 'showAll3DPieces',
  description:
    'Show all hidden pieces in the 3D viewport. / Mostrar todas las piezas ocultas en la vista 3D.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, dispatch, getState): Promise<ToolResult> => {
    const prevHidden = [...getState().simulation.hiddenPieceIds];
    dispatch(showAll3D());
    return {
      success: true,
      data: { showedAll: true },
      rollback: () => dispatch(hideAll3D(prevHidden)),
    };
  },
};

// ─── flipNormal3D ───────────────────────────────────────────────────────────

const flipNormal3DTool: ToolDefinition = {
  name: 'flipNormal3D',
  description:
    'Flip the surface normal of a piece in the 3D viewport (toggle). Useful for inside-out pieces. ' +
    '/ Invertir la normal de superficie de una pieza en la vista 3D (alternar). Útil para piezas al revés.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece to flip / ID de la pieza a invertir' },
    },
    required: ['pieceId'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const pieceId = params.pieceId as string;
    const piece = getState().project.pieces.find((p: { id: string }) => p.id === pieceId);
    if (!piece) return { success: false, error: `Piece "${pieceId}" not found` };
    dispatch(toggleFlipNormal(pieceId));
    const isFlipped = getState().simulation.flippedPieceIds.includes(pieceId);
    return {
      success: true,
      data: { pieceId, flipped: isFlipped },
      rollback: () => dispatch(toggleFlipNormal(pieceId)),
    };
  },
};

// ─── reset3DArrangement ─────────────────────────────────────────────────────

const reset3DArrangementTool: ToolDefinition = {
  name: 'reset3DArrangement',
  description:
    'Reset the 3D position of a specific piece, or reset all piece positions. ' +
    '/ Restablecer la posición 3D de una pieza específica, o restablecer todas las posiciones.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Optional piece ID; omit to reset all / ID de pieza opcional; omitir para restablecer todo' },
    },
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const pieceId = params.pieceId as string | undefined;
    if (pieceId) {
      const piece = getState().project.pieces.find((p: { id: string }) => p.id === pieceId);
      if (!piece) return { success: false, error: `Piece "${pieceId}" not found` };
      const prevPos = getState().project.arrangementOverrides[pieceId];
      dispatch(setArrangement3D({ pieceId, position: [0, 0, 0] }));
      return {
        success: true,
        data: { pieceId, resetPosition: [0, 0, 0] },
        rollback: () => { if (prevPos) dispatch(setArrangement3D({ pieceId, position: prevPos })); },
      };
    }
    const prevOverrides = { ...getState().project.arrangementOverrides };
    dispatch(clearArrangementOverrides());
    return {
      success: true,
      data: { resetAll: true },
      rollback: () => {
        for (const [id, pos] of Object.entries(prevOverrides)) {
          dispatch(setArrangement3D({ pieceId: id, position: pos as [number, number, number] }));
        }
      },
    };
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
  hide3DPieceTool,
  show3DPieceTool,
  showAll3DPiecesTool,
  flipNormal3DTool,
  reset3DArrangementTool,
];
