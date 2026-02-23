/**
 * Fabric Tools — search, select, and compare physical fabrics via copilot.
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
} from '../../../utils/cloth/physicalFabric';

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

export const tools: ToolDefinition[] = [
  searchFabricsTool,
  getFabricDetailsTool,
  compareFabricsTool,
];
