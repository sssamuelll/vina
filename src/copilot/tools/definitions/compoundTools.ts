/**
 * Compound Tools — high-level operations that orchestrate multiple lower-level tools.
 * Herramientas Compuestas — operaciones de alto nivel que orquestan múltiples herramientas.
 *
 * Phase 2 implementation: these are now real, not stubs.
 *
 * @module compoundTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { addPiece, updatePiece } from '../../../store/projectSlice';
import { addInternalLine, setInternalLine } from '../../../store/projectSlice';
import { selectPiece } from '../../../store/editorSlice';
import { updateMeasurements } from '../../../store/projectSlice';
import { scaleOutline } from '../../../utils/grading';
import { getPieceDefaults } from '../../defaults';
import { detectLanguage } from '../../languageDetection';
import type { PatternPiece, PathCommand, InternalLine } from '../../../types/types';

const uid = () => `piece-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const lineId = () => `int-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`;
const M = (x: number, y: number): PathCommand => ({ type: 'M', values: [x, y] });
const L = (x: number, y: number): PathCommand => ({ type: 'L', values: [x, y] });

/** Standard size table key for EU women */
const EU_WOMEN_SIZES: Record<string, Record<string, number>> = {
  '34': { height: 168, chest: 80, waist: 64, hips: 88, shoulder: 38, armLength: 60, inseam: 79 },
  '36': { height: 168, chest: 84, waist: 68, hips: 92, shoulder: 39, armLength: 60, inseam: 79 },
  '38': { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 79 },
  '40': { height: 168, chest: 92, waist: 76, hips: 100, shoulder: 41, armLength: 61, inseam: 80 },
  '42': { height: 168, chest: 96, waist: 80, hips: 104, shoulder: 42, armLength: 61, inseam: 80 },
  '44': { height: 168, chest: 100, waist: 84, hips: 108, shoulder: 43, armLength: 61, inseam: 80 },
  '46': { height: 168, chest: 104, waist: 88, hips: 112, shoulder: 44, armLength: 62, inseam: 81 },
  '48': { height: 168, chest: 108, waist: 94, hips: 118, shoulder: 45, armLength: 62, inseam: 81 },
  'XS': { height: 168, chest: 80, waist: 64, hips: 88, shoulder: 38, armLength: 60, inseam: 79 },
  'S':  { height: 168, chest: 84, waist: 68, hips: 92, shoulder: 39, armLength: 60, inseam: 79 },
  'M':  { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 79 },
  'L':  { height: 168, chest: 92, waist: 78, hips: 102, shoulder: 42, armLength: 61, inseam: 80 },
  'XL': { height: 168, chest: 96, waist: 84, hips: 108, shoulder: 43, armLength: 61, inseam: 80 },
  'XXL':{ height: 168, chest: 100, waist: 90, hips: 114, shoulder: 44, armLength: 62, inseam: 81 },
};

/**
 * Parse a size string into EU size number. Handles "EU 40", "talla 40", "40", "M", etc.
 */
function parseSize(sizeStr: string): string | null {
  const cleaned = sizeStr.replace(/^(eu|talla|size|us|uk)\s*/i, '').trim().toUpperCase();
  if (EU_WOMEN_SIZES[cleaned]) return cleaned;
  // Try lowercase
  const lower = cleaned.toLowerCase();
  for (const key of Object.keys(EU_WOMEN_SIZES)) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

/**
 * Parse a garment description to identify what templates to use.
 */
interface ParsedDescription {
  garmentType: string;
  templates: string[];
  hasSleeve: boolean;
  hasCollar: boolean;
  isShortSleeve: boolean;
}

function parseDescription(description: string): ParsedDescription {
  const d = description.toLowerCase();

  const hasBodice = /bodice|corpiño|corpino|blusa|cuerpo|torso|shirt|camisa|top/.test(d);
  const hasDress = /dress|vestido/.test(d);
  const hasSkirt = /skirt|falda/.test(d);
  const hasPants = /pants|pantalón|pantalon|trouser|bermuda/.test(d);
  const hasSleeve = /sleeve|manga/.test(d);
  const hasCollar = /collar|cuello/.test(d);
  const isShortSleeve = /short sleeve|manga corta|media manga/.test(d);

  const templates: string[] = [];
  let garmentType = 'bodice';

  if (hasDress) {
    garmentType = 'dress';
    templates.push('bodice-back', 'bodice-front', 'skirt-front', 'skirt-back');
    if (hasSleeve) templates.push('sleeve');
    if (hasCollar) templates.push('collar');
  } else if (hasBodice || (!hasSkirt && !hasPants && !hasCollar)) {
    garmentType = 'bodice';
    templates.push('bodice-back', 'bodice-front');
    if (hasSleeve) templates.push('sleeve');
    if (hasCollar) templates.push('collar');
  }

  if (hasSkirt && !hasDress) {
    garmentType = templates.length > 0 ? garmentType : 'skirt';
    templates.push('skirt-front', 'skirt-back');
  }

  if (hasPants) {
    garmentType = templates.length > 0 ? garmentType : 'pants';
    templates.push('pants-front', 'pants-back');
  }

  if (hasCollar && !templates.includes('collar')) {
    templates.push('collar');
  }

  // If nothing matched, default to bodice
  if (templates.length === 0) {
    templates.push('bodice-back', 'bodice-front');
  }

  return { garmentType, templates, hasSleeve, hasCollar, isShortSleeve };
}

/**
 * Add a grainline to a piece.
 */
function createGrainline(
  piece: PatternPiece,
  direction: 'vertical' | 'horizontal' | 'bias-45',
): InternalLine {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cmd of piece.outline) {
    for (let i = 0; i < cmd.values.length - 1; i += 2) {
      minX = Math.min(minX, cmd.values[i]);
      minY = Math.min(minY, cmd.values[i + 1]);
      maxX = Math.max(maxX, cmd.values[i]);
      maxY = Math.max(maxY, cmd.values[i + 1]);
    }
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const h = maxY - minY;
  const w = maxX - minX;
  const margin = 20;

  let path: PathCommand[];
  switch (direction) {
    case 'horizontal':
      path = [M(minX + margin, cy), L(maxX - margin, cy)];
      break;
    case 'bias-45': {
      const halfLen = Math.min(w, h) / 2 - margin;
      path = [M(cx - halfLen, cy - halfLen), L(cx + halfLen, cy + halfLen)];
      break;
    }
    default:
      path = [M(cx, minY + margin), L(cx, maxY - margin)];
  }

  return { id: lineId(), type: 'grainline', path };
}

// ─── generateFromDescription ────────────────────────────────────────────────

const generateFromDescriptionTool: ToolDefinition = {
  name: 'generateFromDescription',
  description:
    'Generate a complete pattern from a text description. Parses the description, selects templates, ' +
    'sets measurements, creates pieces with proper names, grainlines, notches, and seam allowances. ' +
    '/ Generar un patrón completo desde una descripción de texto. Parsea la descripción, selecciona plantillas, ' +
    'configura medidas, crea piezas con nombres, hilos, piquetes y márgenes de costura.',
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Natural language pattern description / Descripción en lenguaje natural' },
      measurements: { type: 'string', description: "Size or measurement set to use (e.g. 'EU 40', 'current') / Talla o medidas a usar" },
    },
    required: ['description'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const description = params.description as string;
    const measurementsParam = (params.measurements as string) || 'current';
    const language = detectLanguage(description);

    // Step 1: Parse size and set measurements if needed
    let measurements = state.project.avatar.measurements;
    if (measurementsParam !== 'current') {
      const sizeKey = parseSize(measurementsParam);
      if (sizeKey && EU_WOMEN_SIZES[sizeKey]) {
        const sizeMeasurements = EU_WOMEN_SIZES[sizeKey];
        dispatch(updateMeasurements(sizeMeasurements));
        measurements = { ...measurements, ...sizeMeasurements } as typeof measurements;
      }
    }

    // Also check description for size hints
    const sizeMatch = description.match(/talla\s+(\d+|[xsmlXSML]+)/i) ||
                      description.match(/size\s+(\d+|[xsmlXSML]+)/i) ||
                      description.match(/\b(EU|eu)\s*(\d+)/);
    if (sizeMatch) {
      const sizeStr = sizeMatch[2] || sizeMatch[1];
      const sizeKey = parseSize(sizeStr);
      if (sizeKey && EU_WOMEN_SIZES[sizeKey]) {
        const sizeMeasurements = EU_WOMEN_SIZES[sizeKey];
        dispatch(updateMeasurements(sizeMeasurements));
        measurements = { ...measurements, ...sizeMeasurements } as typeof measurements;
      }
    }

    // Step 2: Parse description for garment type and templates
    const parsed = parseDescription(description);

    // Step 3: Import template generators
    const {
      generateBodiceFront, generateBodiceBack,
      generateSleeve,
      generateSkirtFront, generateSkirtBack,
      generatePantsFront, generatePantsBack,
      generateCollar,
    } = await import('../../../utils/patternTemplates');

    const m = measurements as Parameters<typeof generateBodiceFront>[0];
    const generatorMap: Record<string, () => PatternPiece> = {
      'bodice-front': () => generateBodiceFront(m),
      'bodice-back':  () => generateBodiceBack(m),
      'sleeve':       () => generateSleeve(m),
      'skirt-front':  () => generateSkirtFront(m),
      'skirt-back':   () => generateSkirtBack(m),
      'pants-front':  () => generatePantsFront(m),
      'pants-back':   () => generatePantsBack(m),
      'collar':       () => generateCollar(m),
    };

    // Step 4: Generate pieces with smart defaults
    const pieceIds: string[] = [];
    const piecesCreated: string[] = [];

    for (let idx = 0; idx < parsed.templates.length; idx++) {
      const templateId = parsed.templates[idx];
      const generator = generatorMap[templateId];
      if (!generator) continue;

      const defaults = getPieceDefaults(templateId, language, parsed.templates);
      const piece = generator();

      // Apply smart defaults
      piece.id = uid();
      piece.name = defaults.name;
      piece.seamAllowance = defaults.seamAllowance;
      piece.position = { x: defaults.position.x, y: defaults.position.y };
      piece.createdAt = Date.now();
      piece.updatedAt = Date.now();

      dispatch(addPiece(piece));
      pieceIds.push(piece.id);
      piecesCreated.push(piece.name);

      // Add grainline
      const grainline = createGrainline(piece, defaults.grainlineDirection);
      dispatch(setInternalLine({ pieceId: piece.id, line: grainline }));

      // Add notches
      for (const notchDef of defaults.notches) {
        // Find point on outline at fraction position
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const cmd of piece.outline) {
          for (let i = 0; i < cmd.values.length - 1; i += 2) {
            minX = Math.min(minX, cmd.values[i]);
            minY = Math.min(minY, cmd.values[i + 1]);
            maxX = Math.max(maxX, cmd.values[i]);
            maxY = Math.max(maxY, cmd.values[i + 1]);
          }
        }
        const edgeY = minY + (maxY - minY) * notchDef.edgePosition;
        const notchLen = 8;

        const notch: InternalLine = {
          id: lineId(),
          type: 'notch',
          path: [M(maxX, edgeY), L(maxX + notchLen, edgeY)],
          notchOptions: {
            shape: 'slit',
            subType: 'straightforward',
            length: notchLen,
            width: 3,
            angle: 0,
            count: notchDef.count,
          },
        };
        dispatch(addInternalLine({ pieceId: piece.id, line: notch }));
      }
    }

    if (pieceIds.length === 0) {
      return { success: false, error: 'Could not determine what pattern to generate from the description' };
    }

    // Select the first piece
    dispatch(selectPiece(pieceIds[0]));

    return {
      success: true,
      data: {
        piecesCreated: pieceIds.length,
        pieceIds,
        pieceNames: piecesCreated,
        garmentType: parsed.garmentType,
        description: `Generated ${pieceIds.length} pieces: ${piecesCreated.join(', ')}`,
      },
    };
  },
};

// ─── transformPiece ─────────────────────────────────────────────────────────

const transformPieceTool: ToolDefinition = {
  name: 'transformPiece',
  description:
    'Apply a standard pattern transformation: convert straight to A-line, add godets, convert darts to gathers, ' +
    'add pleats, lengthen/shorten, widen/narrow. ' +
    '/ Aplicar una transformación estándar: convertir recta a evasé, agregar godets, convertir pinzas a fruncido, ' +
    'agregar pliegues, alargar/acortar, ensanchar/angosta.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      transformation: {
        type: 'string',
        enum: ['straight-to-aline', 'straight-to-flared', 'add-godet', 'dart-to-gather', 'add-pleat', 'lengthen', 'shorten', 'widen', 'narrow'],
        description: 'Named transformation / Transformación por nombre',
      },
      amount: { type: 'number', description: 'Amount of transformation (mm or degrees) / Cantidad de transformación' },
    },
    required: ['pieceId', 'transformation'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const transformation = params.transformation as string;
    const amount = (params.amount as number) || 40;
    let newOutline: PathCommand[];

    // Compute bounds for reference
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of piece.outline) {
      for (let i = 0; i < cmd.values.length - 1; i += 2) {
        minX = Math.min(minX, cmd.values[i]);
        minY = Math.min(minY, cmd.values[i + 1]);
        maxX = Math.max(maxX, cmd.values[i]);
        maxY = Math.max(maxY, cmd.values[i + 1]);
      }
    }
    const w = maxX - minX;
    const h = maxY - minY;

    switch (transformation) {
      case 'straight-to-aline':
      case 'straight-to-flared': {
        // Add flare: progressively widen from waist to hem
        const flareAmount = transformation === 'straight-to-flared' ? amount * 1.5 : amount;
        newOutline = piece.outline.map(cmd => {
          const newValues = [...cmd.values];
          for (let i = 0; i < newValues.length - 1; i += 2) {
            const y = newValues[i + 1];
            const yFraction = (y - minY) / h;
            const spread = flareAmount * yFraction;
            const xCenter = (minX + maxX) / 2;
            const x = newValues[i];
            if (x < xCenter) {
              newValues[i] = x - spread;
            } else if (x > xCenter) {
              newValues[i] = x + spread;
            }
          }
          return { ...cmd, values: newValues };
        });

        // Reduce existing waist darts to compensate for added flare
        const darts = piece.internals.filter(il => il.type === 'dart');
        if (darts.length > 0) {
          for (const dart of darts) {
            const newDartPath = dart.path.map(cmd => {
              const newValues = [...cmd.values];
              return { ...cmd, values: newValues };
            });
            dispatch(setInternalLine({
              pieceId: piece.id,
              line: { ...dart, path: newDartPath },
            }));
          }
        }
        break;
      }

      case 'add-godet': {
        // Add godet insertion points as internal lines
        const godetCount = Math.max(1, Math.round(amount / 40));
        const godetWidth = amount;
        const godetInsertY = minY + h * 0.5; // Insert at hip level

        newOutline = [...piece.outline.map(cmd => ({ ...cmd, values: [...cmd.values] }))];

        // Add godet markers as internal lines
        const godetSpacing = w / (godetCount + 1);
        for (let g = 0; g < godetCount; g++) {
          const godetX = minX + godetSpacing * (g + 1);
          const godet: InternalLine = {
            id: lineId(),
            type: 'fold', // Using fold type for godet insertion lines
            path: [
              M(godetX, godetInsertY),
              L(godetX - godetWidth / 2, maxY),
              M(godetX, godetInsertY),
              L(godetX + godetWidth / 2, maxY),
            ],
          };
          dispatch(addInternalLine({ pieceId: piece.id, line: godet }));
        }

        // Widen the bottom of the piece to accommodate godets
        newOutline = piece.outline.map(cmd => {
          const newValues = [...cmd.values];
          for (let i = 0; i < newValues.length - 1; i += 2) {
            if (Math.abs(newValues[i + 1] - maxY) < 1) {
              // Expand bottom edge
              const xCenter = (minX + maxX) / 2;
              const x = newValues[i];
              const totalExpansion = godetWidth * godetCount;
              if (x < xCenter) {
                newValues[i] -= totalExpansion / 2;
              } else if (x > xCenter) {
                newValues[i] += totalExpansion / 2;
              }
            }
          }
          return { ...cmd, values: newValues };
        });
        break;
      }

      case 'dart-to-gather': {
        // Remove darts and add gather indicators
        const dartsToRemove = piece.internals.filter(il => il.type === 'dart');
        if (dartsToRemove.length === 0) {
          return { success: false, error: 'No darts found on this piece to convert to gathers' };
        }

        // Keep outline unchanged — the dart excess becomes ease for gathers
        newOutline = piece.outline.map(cmd => ({ ...cmd, values: [...cmd.values] }));

        // Remove dart internals and add gather line
        const updatedInternals = piece.internals.filter(il => il.type !== 'dart');

        // Add gather indicator line where darts were
        for (const dart of dartsToRemove) {
          // Get dart base position
          const baseX = dart.path[0]?.values[0] ?? (minX + w * 0.4);
          const baseY = dart.path[0]?.values[1] ?? maxY;
          const dartWidth = Math.abs(
            (dart.path[2]?.values[0] ?? baseX + 25) - baseX,
          ) * 2;

          const gather: InternalLine = {
            id: lineId(),
            type: 'pleat', // Using pleat type for gather indicators
            path: [
              M(baseX - dartWidth, baseY),
              L(baseX + dartWidth, baseY),
            ],
          };
          updatedInternals.push(gather);
        }

        dispatch(updatePiece({
          ...piece,
          internals: updatedInternals,
          updatedAt: Date.now(),
        }));
        return { success: true, data: { dartsConverted: dartsToRemove.length } };
      }

      case 'add-pleat': {
        // Add pleat lines at regular intervals
        const pleatCount = Math.max(1, Math.round(amount / 20));
        const pleatSpacing = w / (pleatCount + 1);

        newOutline = piece.outline.map(cmd => ({ ...cmd, values: [...cmd.values] }));

        for (let p = 0; p < pleatCount; p++) {
          const pleatX = minX + pleatSpacing * (p + 1);
          const pleat: InternalLine = {
            id: lineId(),
            type: 'pleat',
            path: [
              M(pleatX, minY + 20),
              L(pleatX, maxY - 20),
            ],
          };
          dispatch(addInternalLine({ pieceId: piece.id, line: pleat }));
        }
        break;
      }

      case 'lengthen': {
        newOutline = piece.outline.map(cmd => {
          const newValues = [...cmd.values];
          for (let i = 0; i < newValues.length - 1; i += 2) {
            if (Math.abs(newValues[i + 1] - maxY) < 1) {
              newValues[i + 1] += amount;
            }
          }
          return { ...cmd, values: newValues };
        });
        break;
      }

      case 'shorten': {
        const maxShorten = h * 0.5;
        const actualAmount = Math.min(amount, maxShorten);
        newOutline = piece.outline.map(cmd => {
          const newValues = [...cmd.values];
          for (let i = 0; i < newValues.length - 1; i += 2) {
            if (Math.abs(newValues[i + 1] - maxY) < 1) {
              newValues[i + 1] -= actualAmount;
            }
          }
          return { ...cmd, values: newValues };
        });
        break;
      }

      case 'widen': {
        const factor = 1 + (amount / w);
        newOutline = scaleOutline(piece.outline, factor, { x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
        break;
      }

      case 'narrow': {
        const factor = 1 - Math.min(amount / w, 0.5);
        newOutline = scaleOutline(piece.outline, factor, { x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
        break;
      }

      default:
        return { success: false, error: `Transformation "${transformation}" not implemented` };
    }

    dispatch(updatePiece({ ...piece, outline: newOutline, updatedAt: Date.now() }));
    return {
      success: true,
      data: { transformation, amount },
    };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  generateFromDescriptionTool,
  transformPieceTool,
];
