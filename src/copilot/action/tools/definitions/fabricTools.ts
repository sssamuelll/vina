/**
 * Fabric Tools — search, select, compare, and assign physical fabrics via copilot.
 *
 * @module fabricTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import {
  searchPhysicalFabrics,
  getPhysicalFabric,
  getAllPhysicalFabrics,
  toXPBDParams,
  type PhysicalFabric,
} from '../../../../utils/cloth/physicalFabric';
import { setFabric, setPieceTint } from '../../../../store/simulationSlice';

function fabricSummary(f: PhysicalFabric) {
  return {
    id: f.id,
    name: f.name,
    nameEs: f.nameEs,
    composition: f.composition,
    weaveType: f.weaveType,
    weight: `${f.weight} g/m²`,
    thickness: `${f.thickness} mm`,
    stretch: `warp ${f.stretchWarp}%, weft ${f.stretchWeft}%, bias ${f.stretchBias}%`,
    recovery: `${(f.recoveryRate * 100).toFixed(0)}%`,
    bending: `warp ${f.bendingWarp}, weft ${f.bendingWeft} mN·cm`,
    drape: f.drapeCoefficient,
    shear: `${f.shearStiffness} N/m`,
    tensileStrength: `warp ${f.tensileStrengthWarp}, weft ${f.tensileStrengthWeft} N/5cm`,
    maxStretch: `${f.maxStretchBeforeBreak}% before break`,
    tags: f.tags,
  };
}

const searchFabricsTool: ToolDefinition = {
  name: 'searchFabrics',
  description:
    'Search the physical fabric library by keyword (name, composition, weave type, use case). ' +
    'Returns fabrics with real-world engineering properties. ' +
    '/ Buscar la librería de telas por palabra clave (nombre, composición, tipo de tejido, uso).',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (e.g., "denim", "sportswear", "silk", "stretch") / Consulta',
      },
    },
  },
  execute: async (params): Promise<ToolResult> => {
    const query = params.query as string | undefined;
    const results = query
      ? searchPhysicalFabrics(query)
      : getAllPhysicalFabrics();

    return {
      success: true,
      data: {
        results: results.map(fabricSummary),
        total: results.length,
      },
    };
  },
};

const getFabricDetailsTool: ToolDefinition = {
  name: 'getFabricDetails',
  description:
    'Get full physical properties of a specific fabric, including XPBD solver parameters. ' +
    '/ Obtener propiedades físicas completas de una tela específica.',
  parameters: {
    type: 'object',
    properties: {
      fabricId: {
        type: 'string',
        description: 'Fabric ID (e.g., "cotton-poplin", "denim-12oz", "lycra-spandex")',
      },
    },
    required: ['fabricId'],
  },
  execute: async (params): Promise<ToolResult> => {
    const fabric = getPhysicalFabric(params.fabricId as string);
    if (!fabric) {
      const suggestions = searchPhysicalFabrics(params.fabricId as string);
      return {
        success: false,
        error: `Fabric "${params.fabricId}" not found. ${
          suggestions.length > 0
            ? `Did you mean: ${suggestions.slice(0, 3).map(f => f.id).join(', ')}?`
            : 'Use searchFabrics to find available fabrics.'
        }`,
      };
    }

    const xpbd = toXPBDParams(fabric);
    return {
      success: true,
      data: {
        ...fabricSummary(fabric),
        solverParams: {
          stretchComplianceWarp: xpbd.stretchComplianceWarp.toFixed(3),
          stretchComplianceWeft: xpbd.stretchComplianceWeft.toFixed(3),
          bendComplianceWarp: xpbd.bendComplianceWarp.toFixed(3),
          bendComplianceWeft: xpbd.bendComplianceWeft.toFixed(3),
          shearCompliance: xpbd.shearCompliance.toFixed(3),
          damping: xpbd.damping.toFixed(4),
          density: `${xpbd.density.toFixed(3)} kg/m²`,
        },
      },
    };
  },
};

const compareFabricsTool: ToolDefinition = {
  name: 'compareFabrics',
  description:
    'Compare two or more fabrics side by side. Useful for deciding which fabric works best for a pattern. ' +
    '/ Comparar dos o más telas lado a lado.',
  parameters: {
    type: 'object',
    properties: {
      fabricIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of fabric IDs to compare (e.g., ["cotton-poplin", "cotton-jersey"])',
      },
    },
    required: ['fabricIds'],
  },
  execute: async (params): Promise<ToolResult> => {
    const ids = params.fabricIds as string[];
    const fabrics = ids.map(id => getPhysicalFabric(id)).filter((f): f is PhysicalFabric => f !== undefined);
    const missing = ids.filter(id => !getPhysicalFabric(id));

    if (fabrics.length < 2) {
      return { success: false, error: `Need at least 2 valid fabrics. Missing: ${missing.join(', ')}` };
    }

    const comparison = fabrics.map(f => ({
      id: f.id,
      name: f.name,
      weight: f.weight,
      stretchWarp: `${f.stretchWarp}%`,
      stretchWeft: `${f.stretchWeft}%`,
      recovery: `${(f.recoveryRate * 100).toFixed(0)}%`,
      bendingWarp: f.bendingWarp,
      drape: f.drapeCoefficient,
      shear: f.shearStiffness,
      maxStretch: `${f.maxStretchBeforeBreak}%`,
      tensileWarp: f.tensileStrengthWarp,
    }));

    // Quick analysis
    const lightest = fabrics.reduce((a, b) => a.weight < b.weight ? a : b);
    const stretchiest = fabrics.reduce((a, b) => a.stretchWeft > b.stretchWeft ? a : b);
    const stiffest = fabrics.reduce((a, b) => a.bendingWarp > b.bendingWarp ? a : b);
    const drapiest = fabrics.reduce((a, b) => a.drapeCoefficient > b.drapeCoefficient ? a : b);

    return {
      success: true,
      data: {
        comparison,
        analysis: {
          lightest: lightest.name,
          stretchiest: `${stretchiest.name} (${stretchiest.stretchWeft}% weft)`,
          stiffest: `${stiffest.name} (${stiffest.bendingWarp} mN·cm)`,
          bestDrape: `${drapiest.name} (${drapiest.drapeCoefficient})`,
        },
        missing: missing.length > 0 ? missing : undefined,
      },
    };
  },
};

const assignFabricTool: ToolDefinition = {
  name: 'assignFabric',
  description:
    'Assign a physical fabric to a pattern piece. Updates the simulation fabric and optionally sets a tint color. ' +
    'Supports rollback to restore the previous fabric assignment. ' +
    '/ Asignar una tela física a una pieza de patrón. Actualiza la tela de simulación y opcionalmente establece un color de tinte.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: {
        type: 'string',
        description: 'ID of the pattern piece to assign the fabric to / ID de la pieza de patrón',
      },
      fabricId: {
        type: 'string',
        description: 'Fabric ID from the physical fabric library (e.g., "denim-12oz", "cotton-poplin") / ID de tela',
      },
      tint: {
        type: 'string',
        description: 'Optional hex color tint for the fabric (e.g., "#ff0000") / Color de tinte opcional',
      },
    },
    required: ['pieceId', 'fabricId'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const pieceId = params.pieceId as string;
    const fabricId = params.fabricId as string;
    const tint = params.tint as string | undefined;

    const state = getState();

    // Validate piece exists
    const piece = state.project.pieces.find((p: { id: string }) => p.id === pieceId);
    if (!piece) {
      return {
        success: false,
        error: `Piece "${pieceId}" not found. Use searchFabrics or list pieces first.`,
      };
    }

    // Validate fabric exists in the physical library
    const fabric = getPhysicalFabric(fabricId);
    if (!fabric) {
      const suggestions = searchPhysicalFabrics(fabricId);
      return {
        success: false,
        error: `Fabric "${fabricId}" not found. ${
          suggestions.length > 0
            ? `Did you mean: ${suggestions.slice(0, 3).map(f => f.id).join(', ')}?`
            : 'Use searchFabrics to find available fabrics.'
        }`,
      };
    }

    // Snapshot previous state for rollback
    const prevFabricId =
      state.simulation.pieceFabrics[pieceId] ?? state.simulation.defaultFabricId;
    const prevTint: string | undefined = state.simulation.pieceTints[pieceId];

    // Dispatch fabric assignment
    dispatch(setFabric({ pieceId, fabricId }));

    // Optionally dispatch tint
    if (tint) {
      dispatch(setPieceTint({ pieceId, tint }));
    }

    return {
      success: true,
      data: {
        pieceId,
        pieceName: (piece as { name?: string }).name ?? pieceId,
        fabricId: fabric.id,
        fabricName: fabric.name,
        tint: tint ?? null,
        previousFabricId: prevFabricId,
      },
      rollback: () => {
        dispatch(setFabric({ pieceId, fabricId: prevFabricId }));
        if (tint) {
          // We changed the tint, so restore previous value (or reset to white if none)
          dispatch(setPieceTint({ pieceId, tint: prevTint ?? '#ffffff' }));
        }
      },
    };
  },
};

export const tools: ToolDefinition[] = [
  searchFabricsTool,
  getFabricDetailsTool,
  compareFabricsTool,
  assignFabricTool,
];
