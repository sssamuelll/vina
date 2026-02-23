/**
 * transformPiece compound tool
 * @module compound/transformPiece
 */

import type { ToolDefinition, ToolResult } from '../../registry';
import { updatePiece } from '../../../../store/projectSlice';
import { addInternalLine, setInternalLine } from '../../../../store/projectSlice';
import { scaleOutline } from '../../../../utils/grading';
import type { PathCommand, InternalLine } from '../../../../types/types';
import { lineId, M, L } from '../../../../utils/pathHelpers';

export const transformPieceTool: ToolDefinition = {
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
        const godetCount = Math.max(1, Math.round(amount / 40));
        const godetWidth = amount;
        const godetInsertY = minY + h * 0.5;

        newOutline = [...piece.outline.map(cmd => ({ ...cmd, values: [...cmd.values] }))];

        const godetSpacing = w / (godetCount + 1);
        for (let g = 0; g < godetCount; g++) {
          const godetX = minX + godetSpacing * (g + 1);
          const godet: InternalLine = {
            id: lineId(),
            type: 'fold',
            path: [
              M(godetX, godetInsertY),
              L(godetX - godetWidth / 2, maxY),
              M(godetX, godetInsertY),
              L(godetX + godetWidth / 2, maxY),
            ],
          };
          dispatch(addInternalLine({ pieceId: piece.id, line: godet }));
        }

        newOutline = piece.outline.map(cmd => {
          const newValues = [...cmd.values];
          for (let i = 0; i < newValues.length - 1; i += 2) {
            if (Math.abs(newValues[i + 1] - maxY) < 1) {
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
        const dartsToRemove = piece.internals.filter(il => il.type === 'dart');
        if (dartsToRemove.length === 0) {
          return { success: false, error: 'No darts found on this piece to convert to gathers' };
        }

        newOutline = piece.outline.map(cmd => ({ ...cmd, values: [...cmd.values] }));

        const updatedInternals = piece.internals.filter(il => il.type !== 'dart');

        for (const dart of dartsToRemove) {
          const baseX = dart.path[0]?.values[0] ?? (minX + w * 0.4);
          const baseY = dart.path[0]?.values[1] ?? maxY;
          const dartWidth = Math.abs(
            (dart.path[2]?.values[0] ?? baseX + 25) - baseX,
          ) * 2;

          const gather: InternalLine = {
            id: lineId(),
            type: 'pleat',
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
