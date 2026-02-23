/**
 * Template Tools — generate garments from Seamly2D templates via copilot.
 * 
 * The full pipeline: search catalog → pick template → inject measurements → 
 * generate pieces → auto-sew → add to project.
 *
 * @module templateTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { searchCatalog, getCatalog, getCatalogEntry, type CatalogEntry } from '../../../utils/seamly2d/catalog';
import { PatternTemplateEngine, type SeamlyPattern } from '../../../utils/seamly2d/templateEngine';
import { buildMeasurements, inferSizeSystem, type StandardSize, type SizeSystem } from '../../../utils/seamly2d/sizeTables';
import { autoSew } from '../../../utils/autoSew';
import { addPiece, addSeam, addFabric } from '../../../store/projectSlice';
import { getPhysicalFabric, toBasicMaterial, searchPhysicalFabrics } from '../../../utils/cloth/physicalFabric';
import type { Fabric } from '../../../types/types';

// ─── Template JSON loader (static imports for bundled templates) ────────────

// Templates are loaded at runtime from the converter output.
// In production, these would be bundled or fetched from an API.
// For now, we use dynamic import with the Vite glob pattern.

let templateCache: Map<string, SeamlyPattern> | null = null;
const templateLoaders: Record<string, () => Promise<{ default: SeamlyPattern }>> = {};

async function loadTemplate(id: string): Promise<SeamlyPattern | null> {
  if (!templateCache) {
    templateCache = new Map();
    try {
      // Vite glob import for all converted Seamly2D JSONs
      const modules = import.meta.glob(
        '../../../tools/seamly2d-converter/output/*.json',
        { eager: false }
      ) as Record<string, () => Promise<{ default: SeamlyPattern }>>;

      for (const [path, loader] of Object.entries(modules)) {
        const name = path.split('/').pop()?.replace('.json', '') || '';
        templateLoaders[name] = loader;
      }
    } catch {
      // Glob not available (test environment)
    }
  }

  // Check if already loaded
  const cached = templateCache.get(id);
  if (cached) return cached;

  // Try lazy load via glob loader
  const loader = templateLoaders[id];
  if (loader) {
    try {
      const mod = await loader();
      const pattern = mod.default;
      templateCache.set(id, pattern);
      return pattern;
    } catch {
      return null;
    }
  }

  // Fallback: try fetch from public path
  try {
    const resp = await fetch(`/templates/seamly2d/${id}.json`);
    if (resp.ok) {
      const pattern = await resp.json() as SeamlyPattern;
      templateCache.set(id, pattern);
      return pattern;
    }
  } catch {
    // Not available
  }

  return null;
}

// ─── searchTemplates ────────────────────────────────────────────────────────

const searchTemplatesTool: ToolDefinition = {
  name: 'searchTemplates',
  description:
    'Search available pattern templates by keyword. Returns matching templates with metadata. ' +
    'Supports multiple languages (shirt, camisa, Hemd, chemise). ' +
    '/ Buscar plantillas de patrones por palabra clave. Soporta múltiples idiomas.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (e.g., "blusa", "shirt", "pantalón", "jacket") / Consulta de búsqueda',
      },
      category: {
        type: 'string',
        enum: ['tops', 'bottoms', 'dresses', 'outerwear', 'underwear', 'blocks', 'sleeves'],
        description: 'Filter by category / Filtrar por categoría',
      },
      gender: {
        type: 'string',
        enum: ['women', 'men', 'unisex', 'children'],
        description: 'Filter by gender / Filtrar por género',
      },
    },
  },
  execute: async (params): Promise<ToolResult> => {
    let results: CatalogEntry[];

    if (params.query) {
      results = searchCatalog(params.query as string);
    } else {
      results = getCatalog();
    }

    if (params.category) {
      results = results.filter(e => e.category === params.category);
    }
    if (params.gender) {
      results = results.filter(e => e.gender === params.gender || e.gender === 'unisex');
    }

    return {
      success: true,
      data: {
        results: results.map(e => ({
          id: e.id,
          name: e.name,
          nameEs: e.nameEs,
          category: e.category,
          gender: e.gender,
          complexity: e.complexity,
          description: e.description,
          requiredMeasurements: e.requiredMeasurements,
        })),
        total: results.length,
      },
    };
  },
};

// ─── generateFromTemplate ───────────────────────────────────────────────────

const generateFromTemplateTool: ToolDefinition = {
  name: 'generateFromTemplate',
  description:
    'Generate pattern pieces from a Seamly2D template with body measurements or standard size. ' +
    'Optionally auto-detect seams between generated pieces. ' +
    'Example: generateFromTemplate("male_shirt", size="M") ' +
    '/ Generar piezas de patrón desde una plantilla Seamly2D con medidas o talla estándar.',
  parameters: {
    type: 'object',
    properties: {
      templateId: {
        type: 'string',
        description: 'Template ID from catalog (e.g., "male_shirt", "trousers", "patron_blusa") / ID de la plantilla',
      },
      size: {
        type: 'string',
        enum: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
        description: 'Standard size (uses European size tables) / Talla estándar',
      },
      sizeSystem: {
        type: 'string',
        enum: ['eu-women', 'eu-men', 'eu-children'],
        description: 'Size system (auto-inferred from template gender if omitted) / Sistema de tallas',
      },
      // Individual measurement overrides
      height: { type: 'number', description: 'Height in mm / Altura en mm' },
      chest: { type: 'number', description: 'Chest circumference in mm / Contorno de pecho en mm' },
      waist: { type: 'number', description: 'Waist circumference in mm / Contorno de cintura en mm' },
      hips: { type: 'number', description: 'Hip circumference in mm / Contorno de cadera en mm' },
      shoulder: { type: 'number', description: 'Shoulder length in mm / Largo de hombro en mm' },
      armLength: { type: 'number', description: 'Arm length in mm / Largo de brazo en mm' },
      inseam: { type: 'number', description: 'Inseam in mm / Entrepierna en mm' },
      fabricId: {
        type: 'string',
        description: 'Physical fabric ID (e.g., "cotton-poplin", "denim-12oz", "lycra-spandex"). Use searchFabrics to find options. / ID de tela física',
      },
      autoSew: {
        type: 'boolean',
        description: 'Auto-detect and apply seams (default true) / Auto-detectar y aplicar costuras',
      },
      addToProject: {
        type: 'boolean',
        description: 'Add generated pieces to current project (default true) / Añadir piezas al proyecto actual',
      },
    },
    required: ['templateId'],
  },
  execute: async (params, dispatch, _getState): Promise<ToolResult> => {
    const templateId = params.templateId as string;

    // Validate template exists in catalog
    const entry = getCatalogEntry(templateId);
    if (!entry) {
      const suggestions = searchCatalog(templateId);
      return {
        success: false,
        error: `Template "${templateId}" not found. ${
          suggestions.length > 0
            ? `Did you mean: ${suggestions.slice(0, 3).map(s => s.id).join(', ')}?`
            : 'Use searchTemplates to find available templates.'
        }`,
      };
    }

    // Load template JSON
    const pattern = await loadTemplate(templateId);
    if (!pattern) {
      return { success: false, error: `Could not load template file for "${templateId}"` };
    }

    // Build measurements
    const size = params.size as StandardSize | undefined;
    const system = (params.sizeSystem as SizeSystem) || inferSizeSystem(entry.gender);

    const overrides: Record<string, number> = {};
    for (const key of ['height', 'chest', 'waist', 'hips', 'shoulder', 'armLength', 'inseam']) {
      if (params[key] !== undefined) overrides[key] = params[key] as number;
    }

    const measurements = size
      ? buildMeasurements(size, system, overrides)
      : buildMeasurements('M', system, overrides); // Default to M if no size given

    // Check required measurements
    const missing = entry.requiredMeasurements.filter(m => {
      const val = measurements[m as keyof typeof measurements];
      return val === undefined || val === 0;
    });

    if (missing.length > 0) {
      return {
        success: false,
        error: `Missing required measurements: ${missing.join(', ')}. Provide a size or individual values.`,
      };
    }

    // Generate pieces
    const engine = new PatternTemplateEngine();
    engine.loadPattern(pattern);

    let pieces;
    try {
      pieces = engine.generate(measurements);
    } catch (err) {
      return { success: false, error: `Generation error: ${(err as Error).message}` };
    }

    if (pieces.length === 0) {
      return { success: false, error: 'Template generated 0 pieces' };
    }

    // Resolve fabric
    const fabricIdParam = params.fabricId as string | undefined;
    let projectFabric: Fabric | null = null;
    let fabricName: string | null = null;

    if (fabricIdParam) {
      const physFabric = getPhysicalFabric(fabricIdParam);
      if (!physFabric) {
        const suggestions = searchPhysicalFabrics(fabricIdParam);
        return {
          success: false,
          error: `Fabric "${fabricIdParam}" not found. ${
            suggestions.length > 0
              ? `Did you mean: ${suggestions.slice(0, 3).map(f => f.id).join(', ')}?`
              : 'Use searchFabrics to find available fabrics.'
          }`,
        };
      }
      const basic = toBasicMaterial(physFabric);
      projectFabric = {
        id: physFabric.id,
        name: physFabric.name,
        color: '#e8e4df',
        weight: basic.weight,
        stretch: 1 - basic.stretchStiffness,
        stiffness: basic.bendStiffness,
        friction: basic.friction,
      };
      fabricName = physFabric.name;

      // Assign fabric to all pieces
      for (const piece of pieces) {
        piece.fabricId = physFabric.id;
      }
    }

    // Layout pieces side by side (don't stack them)
    let xOffset = 0;
    for (const piece of pieces) {
      piece.position = { x: xOffset, y: 0 };
      // Rough width estimate from outline bounds
      const xs = piece.outline
        .filter(c => c.values.length >= 2)
        .map(c => c.type === 'C' ? c.values[4] : c.values[0]);
      const width = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 200;
      xOffset += width + 50; // 50mm gap
    }

    // Auto-sew
    const doAutoSew = params.autoSew !== false;
    let sewResult = null;
    if (doAutoSew && pieces.length >= 2) {
      sewResult = autoSew(pieces);
    }

    // Add to project
    const doAdd = params.addToProject !== false;
    if (doAdd) {
      if (projectFabric) {
        dispatch(addFabric(projectFabric));
      }
      for (const piece of pieces) {
        dispatch(addPiece(piece));
      }
      if (sewResult) {
        for (const proposed of sewResult.seams) {
          if (proposed.confidence >= 0.6) {
            dispatch(addSeam(proposed.seam));
          }
        }
      }
    }

    return {
      success: true,
      data: {
        template: entry.name,
        size: size || 'M (default)',
        sizeSystem: system,
        fabric: fabricName || 'none (default cotton)',
        piecesGenerated: pieces.length,
        pieces: pieces.map(p => ({ id: p.id, name: p.name })),
        seams: sewResult ? {
          proposed: sewResult.seams.length,
          applied: sewResult.seams.filter(s => s.confidence >= 0.6).length,
          details: sewResult.seams.map(s => ({
            pieceA: pieces.find(p => p.id === s.seam.pieceA.pieceId)?.name,
            pieceB: pieces.find(p => p.id === s.seam.pieceB.pieceId)?.name,
            confidence: Math.round(s.confidence * 100) + '%',
            reason: s.reason,
          })),
        } : null,
        addedToProject: doAdd,
      },
    };
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  searchTemplatesTool,
  generateFromTemplateTool,
];
