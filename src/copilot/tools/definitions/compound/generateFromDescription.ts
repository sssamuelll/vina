/**
 * generateFromDescription compound tool
 * @module compound/generateFromDescription
 */

import type { ToolDefinition, ToolResult } from '../../registry';
import { addPiece, updateMeasurements } from '../../../../store/projectSlice';
import { addInternalLine, setInternalLine } from '../../../../store/projectSlice';
import { selectPiece } from '../../../../store/editorSlice';
import { EU_WOMEN_SIZES, parseSize } from '../../../../utils/sizeTable';
import { getPieceDefaults } from '../../../defaults';
import { detectLanguage } from '../../../languageDetection';
import type { PatternPiece, PathCommand, InternalLine } from '../../../../types/types';
import { uid, lineId, M, L } from '../../../../utils/pathHelpers';

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

export const generateFromDescriptionTool: ToolDefinition = {
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
    } = await import('../../../../utils/patternTemplates');

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
