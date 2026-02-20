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
} from '../../../store/simulationSlice';
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

export const tools: ToolDefinition[] = [
  setFabricTool,
  listFabricsTool,
  startSimulationTool,
  pauseSimulationTool,
];
