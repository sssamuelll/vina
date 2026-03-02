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
