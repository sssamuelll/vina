/**
 * Zod validation schemas for tool parameters.
 * @module copilot/action/tools/validation
 */

import { z } from 'zod';

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const ModifyDimensionSchema = z.object({
  pieceId: z.string().min(1, 'pieceId required'),
  edgeName: z.string().min(1, 'edgeName required'),
  delta: z.number(),
});

export const CreatePieceSchema = z.object({
  name: z.string().min(1, 'name required'),
  outline: z.array(z.object({
    type: z.enum(['M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A', 'Z']),
    values: z.array(z.number()),
  })),
});

export const PieceIdSchema = z.object({
  pieceId: z.string().min(1, 'pieceId required'),
});

/**
 * Sewn-range percent pair [startPct, endPct] — CLO3D-style seam extents
 * (D3: tool args are zod scope). Maps to Seam half tStart/tEnd fractions
 * via `utils/seam/seamRange.applyPctRange`.
 */
export const PctRangeSchema = z.tuple([
  z.number().min(0, 'range % must be >= 0').max(100, 'range % must be <= 100'),
  z.number().min(0, 'range % must be >= 0').max(100, 'range % must be <= 100'),
]).refine(([s, e]) => s < e, 'range start % must be less than end %');

export const SetSeamRangeSchema = z.object({
  seamId: z.string().min(1, 'seamId required'),
  rangeA: PctRangeSchema.optional(),
  rangeB: PctRangeSchema.optional(),
}).refine(p => p.rangeA !== undefined || p.rangeB !== undefined, 'provide rangeA and/or rangeB');

export const CreateSeamSchema = z.object({
  pieceAId: z.string().min(1, 'pieceAId required'),
  edgeAName: z.string().min(1, 'edgeAName required'),
  pieceBId: z.string().min(1, 'pieceBId required'),
  edgeBName: z.string().min(1, 'edgeBName required'),
  seamType: z.enum(['standard', 'french', 'flat-felled', 'overlock']).optional(),
  rangeA: PctRangeSchema.optional(),
  rangeB: PctRangeSchema.optional(),
});

// ─── Validator ───────────────────────────────────────────────────────────────

/**
 * Validate tool parameters against a Zod schema.
 */
export function validateToolParams<T>(
  schema: z.ZodSchema<T>,
  params: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(params);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues.map(i => i.message).join(', '),
    };
  }
  return { success: true, data: result.data };
}
