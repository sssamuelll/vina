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
} from '../../../store/simulationSlice';
import type { FitMapMode } from '../../../utils/cloth/fitMaps';
import { FABRIC_LIBRARY } from '../../../utils/cloth/fabricLibrary';

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

export const tools: ToolDefinition[] = [
  setFabricTool,
  listFabricsTool,
  startSimulationTool,
  pauseSimulationTool,
  setFitMapModeTool,
  configureFitMapTool,
];
