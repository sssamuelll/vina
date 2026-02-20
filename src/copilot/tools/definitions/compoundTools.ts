/**
 * Compound Tools — high-level operations that orchestrate multiple lower-level tools.
 * Herramientas Compuestas — operaciones de alto nivel que orquestan múltiples herramientas.
 *
 * @module compoundTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { addPiece, updatePiece } from '../../../store/projectSlice';
import { selectPiece } from '../../../store/editorSlice';
import { scaleOutline } from '../../../utils/grading';
import type { PatternPiece, PathCommand } from '../../../types/types';

const uid = () => `piece-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ─── generateFromDescription ────────────────────────────────────────────────

const generateFromDescriptionTool: ToolDefinition = {
  name: 'generateFromDescription',
  description:
    'Generate a complete pattern from a text description. The agent interprets the description, selects templates, and creates pieces. ' +
    '/ Generar un patrón completo desde una descripción de texto. El agente interpreta la descripción, selecciona plantillas y crea piezas.',
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Natural language pattern description in Spanish or English / Descripción en lenguaje natural' },
      measurements: { type: 'string', description: "Size or measurement set to use (e.g. 'EU 40', 'current') / Talla o medidas a usar" },
    },
    required: ['description'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const description = (params.description as string).toLowerCase();
    const measurements = state.project.avatar.measurements;

    // Simple keyword-based generation (the LLM normally orchestrates individual tools,
    // but this provides a fallback for the built-in agent)
    const {
      generateBodiceFront, generateBodiceBack,
      generateSleeve,
      generateSkirtFront, generateSkirtBack,
      generatePantsFront, generatePantsBack,
      generateCollar,
    } = await import('../../../utils/patternTemplates');

    const m = measurements as Parameters<typeof generateBodiceFront>[0];
    const pieces: PatternPiece[] = [];

    const hasBodice = /bodice|corpiño|blusa|cuerpo|torso|dress|vestido|shirt|camisa/.test(description);
    const hasSleeve = /sleeve|manga/.test(description);
    const hasSkirt = /skirt|falda|dress|vestido/.test(description);
    const hasPants = /pants|pantalón|trouser|bermuda/.test(description);
    const hasCollar = /collar|cuello/.test(description);

    if (hasBodice || (!hasSkirt && !hasPants)) {
      pieces.push(generateBodiceBack(m));
      pieces.push(generateBodiceFront(m));
    }
    if (hasSleeve) {
      pieces.push(generateSleeve(m));
    }
    if (hasSkirt) {
      pieces.push(generateSkirtFront(m));
      pieces.push(generateSkirtBack(m));
    }
    if (hasPants) {
      pieces.push(generatePantsFront(m));
      pieces.push(generatePantsBack(m));
    }
    if (hasCollar) {
      pieces.push(generateCollar(m));
    }

    if (pieces.length === 0) {
      return { success: false, error: 'Could not determine what pattern to generate from the description' };
    }

    const pieceIds: string[] = [];
    for (const piece of pieces) {
      piece.id = uid();
      piece.createdAt = Date.now();
      piece.updatedAt = Date.now();
      dispatch(addPiece(piece));
      pieceIds.push(piece.id);
    }

    if (pieceIds.length > 0) {
      dispatch(selectPiece(pieceIds[0]));
    }

    return {
      success: true,
      data: {
        piecesCreated: pieces.length,
        pieceIds,
        description: `Generated ${pieces.length} pieces from description`,
      },
    };
  },
};

// ─── transformPiece ─────────────────────────────────────────────────────────

const transformPieceTool: ToolDefinition = {
  name: 'transformPiece',
  description:
    'Apply a standard pattern transformation: convert straight to A-line, add godets, convert darts to gathers, etc. ' +
    '/ Aplicar una transformación estándar: convertir recta a evasé, agregar godets, convertir pinzas a fruncido, etc.',
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
        // Add flare to bottom edges
        newOutline = piece.outline.map(cmd => {
          const newValues = [...cmd.values];
          for (let i = 0; i < newValues.length - 1; i += 2) {
            const y = newValues[i + 1];
            const yFraction = (y - minY) / h;
            // Increase width progressively toward bottom
            const spread = amount * yFraction;
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
        break;
      }

      case 'lengthen': {
        // Extend bottom edge downward
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
        // Move bottom edge upward
        newOutline = piece.outline.map(cmd => {
          const newValues = [...cmd.values];
          for (let i = 0; i < newValues.length - 1; i += 2) {
            if (Math.abs(newValues[i + 1] - maxY) < 1) {
              newValues[i + 1] -= Math.min(amount, h * 0.5);
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
        // For compound transformations not yet implemented, pass through
        return { success: false, error: `Transformation "${transformation}" not yet implemented for direct execution` };
    }

    dispatch(updatePiece({ ...piece, outline: newOutline, updatedAt: Date.now() }));
    return { success: true };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  generateFromDescriptionTool,
  transformPieceTool,
];
