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
  toMeshPhysicalParams,
  type PhysicalFabric,
} from '../../../../utils/cloth/physicalFabric';
import {
  setFabric,
  setPieceTint,
  setPieceOpacity,
  clearPieceOpacity,
  setPieceEmission,
  clearPieceEmission,
} from '../../../../store/simulationSlice';

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

const setPieceOpacityTool: ToolDefinition = {
  name: 'setPieceOpacity',
  description:
    'Set the opacity of a piece in 3D. 0 = fully transparent, 1 = fully opaque. ' +
    'Use for sheer fabrics like chiffon, organza, tulle. ' +
    '/ Establecer la opacidad de una pieza en 3D. 0 = transparente, 1 = opaco.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: {
        type: 'string',
        description: 'ID of the pattern piece / ID de la pieza de patrón',
      },
      opacity: {
        type: 'number',
        description: 'Opacity value 0-1 (0 = transparent, 1 = opaque) / Valor de opacidad 0-1',
      },
    },
    required: ['pieceId', 'opacity'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const pieceId = params.pieceId as string;
    const rawOpacity = params.opacity as number;

    if (typeof rawOpacity !== 'number' || !Number.isFinite(rawOpacity)) {
      return { success: false, error: 'opacity must be a finite number between 0 and 1' };
    }

    const state = getState();

    // Validate piece exists
    const piece = state.project.pieces.find((p: { id: string }) => p.id === pieceId);
    if (!piece) {
      return {
        success: false,
        error: `Piece "${pieceId}" not found. List pieces first.`,
      };
    }

    const prevOpacity = state.simulation.pieceOpacity[pieceId];

    // Clamp opacity to [0, 1]
    const opacity = Math.max(0, Math.min(1, rawOpacity));

    dispatch(setPieceOpacity({ pieceId, opacity }));

    return {
      success: true,
      data: {
        pieceId,
        pieceName: (piece as { name?: string }).name ?? pieceId,
        opacity,
      },
      rollback: () => {
        if (prevOpacity !== undefined) {
          dispatch(setPieceOpacity({ pieceId, opacity: prevOpacity }));
        } else {
          dispatch(clearPieceOpacity(pieceId));
        }
      },
    };
  },
};

const setPieceEmissionTool: ToolDefinition = {
  name: 'setPieceEmission',
  description:
    'Set emission (glow) color and intensity for a piece. Useful for presentation renders. ' +
    '/ Establecer color de emisión (brillo) e intensidad para una pieza. Útil para renders de presentación.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: {
        type: 'string',
        description: 'ID of the pattern piece / ID de la pieza de patrón',
      },
      color: {
        type: 'string',
        description: 'Emission color as hex string (e.g., "#ff0000") / Color de emisión en hexadecimal',
      },
      intensity: {
        type: 'number',
        description: 'Emission intensity 0-5 (default 1) / Intensidad de emisión 0-5',
      },
    },
    required: ['pieceId', 'color'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const pieceId = params.pieceId as string;
    const color = params.color as string;
    const rawIntensity = (params.intensity as number | undefined) ?? 1;

    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      return { success: false, error: `Invalid hex color "${color}". Use format "#rrggbb".` };
    }

    if (!Number.isFinite(rawIntensity)) {
      return { success: false, error: 'intensity must be a finite number between 0 and 5' };
    }

    const state = getState();

    // Validate piece exists
    const piece = state.project.pieces.find((p: { id: string }) => p.id === pieceId);
    if (!piece) {
      return {
        success: false,
        error: `Piece "${pieceId}" not found. List pieces first.`,
      };
    }

    const prevColor = state.simulation.pieceEmission[pieceId];
    const prevIntensity = state.simulation.pieceEmissionIntensity[pieceId];

    // Clamp intensity to [0, 5]
    const intensity = Math.max(0, Math.min(5, rawIntensity));

    dispatch(setPieceEmission({ pieceId, color, intensity }));

    return {
      success: true,
      data: {
        pieceId,
        pieceName: (piece as { name?: string }).name ?? pieceId,
        emissionColor: color,
        emissionIntensity: intensity,
      },
      rollback: () => {
        if (prevColor !== undefined) {
          dispatch(setPieceEmission({ pieceId, color: prevColor, intensity: prevIntensity }));
        } else {
          dispatch(clearPieceEmission(pieceId));
        }
      },
    };
  },
};

const getMaterialPropertiesTool: ToolDefinition = {
  name: 'getMaterialProperties',
  description:
    'Get comprehensive material/render properties for a pattern piece, including fabric, tint, opacity, emission, ' +
    'textures, UV transforms, and computed PBR render parameters. ' +
    '/ Obtener propiedades completas de material de una pieza: tela, tinte, opacidad, emisión, texturas, UV y parámetros PBR.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: {
        type: 'string',
        description: 'ID of the pattern piece / ID de la pieza de patrón',
      },
    },
    required: ['pieceId'],
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const pieceId = params.pieceId as string;
    const state = getState();

    // Validate piece exists
    const piece = state.project.pieces.find((p: { id: string }) => p.id === pieceId);
    if (!piece) {
      return {
        success: false,
        error: `Piece "${pieceId}" not found. List pieces first.`,
      };
    }

    const sim = state.simulation;
    const fabricId = sim.pieceFabrics[pieceId] ?? sim.defaultFabricId;
    const fabric = getPhysicalFabric(fabricId);
    const tint = sim.pieceTints[pieceId] ?? '#ffffff';
    const opacity = sim.pieceOpacity[pieceId] ?? undefined;
    const emissionColor = sim.pieceEmission[pieceId] ?? undefined;
    const emissionIntensity = sim.pieceEmissionIntensity[pieceId] ?? undefined;
    const textureOverrides = sim.pieceTextureOverrides[pieceId] ?? {};
    const uvTransform = sim.pieceUVTransforms[pieceId] ?? { repeatX: 4, repeatY: 4, rotation: 0 };

    // Compute render params from fabric
    let renderParams: Record<string, unknown> | undefined;
    if (fabric) {
      const params = toMeshPhysicalParams(fabric, tint);
      renderParams = {
        roughness: params.roughness,
        metalness: params.metalness,
        sheen: params.sheen,
        sheenRoughness: params.sheenRoughness,
        sheenColor: params.sheenColor,
        clearcoat: params.clearcoat,
        clearcoatRoughness: params.clearcoatRoughness,
        transmission: params.transmission,
        thickness: params.thickness,
        ior: params.ior,
        baseOpacity: params.opacity,
      };
    }

    return {
      success: true,
      data: {
        pieceId,
        pieceName: (piece as { name?: string }).name ?? pieceId,
        fabricId,
        fabricName: fabric?.name ?? 'unknown',
        tint,
        opacity: opacity ?? (renderParams?.baseOpacity as number | undefined) ?? 1,
        emission: emissionColor ? { color: emissionColor, intensity: emissionIntensity ?? 0 } : null,
        textureOverrides,
        uvTransform,
        renderParams: renderParams ?? null,
      },
    };
  },
};

export const tools: ToolDefinition[] = [
  searchFabricsTool,
  getFabricDetailsTool,
  compareFabricsTool,
  assignFabricTool,
  setPieceOpacityTool,
  setPieceEmissionTool,
  getMaterialPropertiesTool,
];
