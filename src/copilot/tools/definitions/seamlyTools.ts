/**
 * Seamly2D Pattern Tools — load real patterns from Seamly2D .sm2d conversions.
 *
 * These are professionally designed patterns with proper construction geometry.
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { adaptSeamlyPattern, type SeamlyPattern } from '../../../utils/seamly2d/seamlyAdapter';
import { loadConstruction } from '../../../store/constructionSlice';
import { addPiece } from '../../../store/projectSlice';
import { selectPiece } from '../../../store/editorSlice';
import { buildPieceWithOffset } from '../../../utils/construction/pieceBuilder';
import { setConstructionPieceNormOffset } from '../../../store/constructionSlice';
import { clearConstruction } from '../../../store/constructionSlice';

// ─── Lazy-load pattern JSONs via Vite glob ──────────────────────────────────

const patternModules = import.meta.glob(
  '../../../../tools/seamly2d-converter/output/*.json',
  { eager: false },
);

interface PatternMeta {
  id: string;
  filename: string;
  loader: () => Promise<unknown>;
}

const patternIndex: PatternMeta[] = Object.entries(patternModules).map(([path, loader]) => {
  const filename = path.split('/').pop()!.replace('.json', '');
  return {
    id: filename,
    filename,
    loader: loader as () => Promise<unknown>,
  };
});

// ─── listSeamlyPatterns ─────────────────────────────────────────────────────

const listSeamlyPatternsTool: ToolDefinition = {
  name: 'listSeamlyPatterns',
  description:
    'List all available Seamly2D patterns — real patterns designed by professional pattern makers. ' +
    'These are converted from .sm2d files with full construction geometry. ' +
    '/ Listar patrones Seamly2D disponibles.',
  parameters: { type: 'object', properties: {} },
  execute: async (): Promise<ToolResult> => {
    return {
      success: true,
      data: {
        patterns: patternIndex.map(p => ({
          id: p.id,
          name: p.filename.replace(/_/g, ' '),
        })),
        total: patternIndex.length,
        hint: 'Use loadSeamlyPattern with the id to load a pattern.',
      },
    };
  },
};

// ─── loadSeamlyPattern ──────────────────────────────────────────────────────

const loadSeamlyPatternTool: ToolDefinition = {
  name: 'loadSeamlyPattern',
  description:
    'Load a Seamly2D pattern into the editor. Resolves all construction geometry and builds pattern pieces. ' +
    'These are REAL patterns from professional pattern makers — much better than hand-built blueprints. ' +
    '/ Cargar un patrón Seamly2D en el editor.',
  parameters: {
    type: 'object',
    properties: {
      patternId: { type: 'string', description: 'Pattern ID from listSeamlyPatterns' },
      clearFirst: { type: 'boolean', description: 'Clear existing pieces first (default: true)' },
    },
    required: ['patternId'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const patternId = params.patternId as string;
    const meta = patternIndex.find(p => p.id === patternId);

    if (!meta) {
      return {
        success: false,
        error: `Pattern "${patternId}" not found. Use listSeamlyPatterns to see available patterns.`,
      };
    }

    // Load the JSON
    let patternData: SeamlyPattern;
    try {
      const mod = await meta.loader() as { default: SeamlyPattern };
      patternData = mod.default || mod as unknown as SeamlyPattern;
    } catch (e) {
      return { success: false, error: `Failed to load pattern: ${(e as Error).message}` };
    }

    // Get user measurements and map to Seamly2D measurement names
    const state = getState();
    const userMeas = state.project.avatar.measurements as unknown as Record<string, number>;

    // Map our measurement names to Seamly2D names
    const measMapping: Record<string, string> = {
      height: 'height',
      chest: 'bust_circ',
      waist: 'waist_circ',
      hips: 'hip_circ',
      shoulder: 'shoulder_length',
      armLength: 'arm_shoulder_tip_to_wrist_bent',
      neckCirc: 'neck_circ',
    };

    const overrides: Record<string, number> = {};
    for (const [ourName, seamlyName] of Object.entries(measMapping)) {
      if (userMeas[ourName] != null) {
        overrides[seamlyName] = userMeas[ourName];
      }
    }

    // Adapt the pattern
    const result = adaptSeamlyPattern(patternData, overrides);

    if (result.pieces.length === 0) {
      return {
        success: false,
        error: `Pattern has no buildable pieces. Errors: ${result.errors.join('; ')}`,
      };
    }

    // Clear existing construction
    if (params.clearFirst !== false) {
      dispatch(clearConstruction());
    }

    // Load construction into Redux
    dispatch(loadConstruction({
      points: result.points,
      lines: [],
      curves: result.curves,
      pieces: result.pieces,
      variables: result.variables,
    }));

    // Build PatternPieces from construction pieces
    const ctx = {
      measurements: { ...patternData.measurements.defaults, ...overrides },
      variables: result.variables,
    };

    const builtPieces: { id: string; name: string; width: string; height: string }[] = [];
    const buildErrors: string[] = [];
    let xOffset = 50;

    // Convert cm → mm for piece coordinates (Seamly2D works in cm)
    const scale = patternData.unit === 'cm' ? 10 : 1;

    for (const cPiece of result.pieces) {
      try {
        const { piece, normOffset } = buildPieceWithOffset(cPiece, result.points, result.curves, ctx);

        // Scale to mm if needed
        if (scale !== 1) {
          for (const cmd of piece.outline) {
            for (let i = 0; i < cmd.values.length; i++) {
              cmd.values[i] *= scale;
            }
          }
        }

        dispatch(setConstructionPieceNormOffset({ pieceId: cPiece.id, normOffset }));

        const xs = piece.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0));
        const ys = piece.outline.flatMap(c => c.values.filter((_, i) => i % 2 === 1));
        const pieceWidth = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 200;
        const pieceHeight = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 200;

        // Skip degenerate pieces (0 width or height)
        if (pieceWidth < 5 && pieceHeight < 5) {
          buildErrors.push(`${cPiece.name}: degenerate (${pieceWidth.toFixed(0)}×${pieceHeight.toFixed(0)}mm)`);
          continue;
        }

        piece.position = { x: xOffset, y: 50 };
        xOffset += pieceWidth + 80;

        dispatch(addPiece(piece));
        builtPieces.push({
          id: piece.id,
          name: piece.name,
          width: (pieceWidth / 10).toFixed(1) + 'cm',
          height: (pieceHeight / 10).toFixed(1) + 'cm',
        });
      } catch (e) {
        buildErrors.push(`${cPiece.name}: ${(e as Error).message}`);
      }
    }

    if (builtPieces.length > 0) {
      dispatch(selectPiece(builtPieces[0].id));
    }

    return {
      success: builtPieces.length > 0,
      data: {
        pattern: patternData.name || meta.filename,
        unit: patternData.unit,
        constructionSteps: patternData.construction.length,
        pointsResolved: result.points.filter(p => p.x !== 0 || p.y !== 0).length,
        pointsTotal: result.points.length,
        piecesBuilt: builtPieces,
        ...(buildErrors.length > 0 ? { buildErrors } : {}),
        ...(result.errors.length > 0 ? { adapterErrors: result.errors } : {}),
      },
    };
  },
};

export const tools: ToolDefinition[] = [
  listSeamlyPatternsTool,
  loadSeamlyPatternTool,
];
