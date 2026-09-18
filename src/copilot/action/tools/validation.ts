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
 * #1194 — los mensajes ESCRITOS a mano aquí van en español y los generados por
 * zod, en inglés. No es descuido: los canónicos (`Missing required parameter`,
 * `Parameter "x" must be…`) los lee `classifyError` por subcadena y los traduce
 * `mensajeDeErrorEs` al pintarlos; estos de abajo no los lee ningún consumidor
 * —salen tal cual a la línea 310 y al LLM—, así que el único idioma que importa
 * es el de la usuaria.
 */
const PCT_FUERA_DE_RANGO = 'el porcentaje tiene que estar entre 0 y 100';

/**
 * Sewn-range percent pair [startPct, endPct] — CLO3D-style seam extents
 * (D3: tool args are zod scope). Maps to Seam half tStart/tEnd fractions
 * via `utils/seam/seamRange.applyPctRange`.
 */
export const PctRangeSchema = z.tuple([
  z.number().min(0, PCT_FUERA_DE_RANGO).max(100, PCT_FUERA_DE_RANGO),
  z.number().min(0, PCT_FUERA_DE_RANGO).max(100, PCT_FUERA_DE_RANGO),
]).refine(([s, e]) => s < e, 'el tramo tiene que empezar antes de terminar');

export const SetSeamRangeSchema = z.object({
  seamId: z.string().min(1, 'seamId required'),
  rangeA: PctRangeSchema.optional(),
  rangeB: PctRangeSchema.optional(),
}).refine(p => p.rangeA !== undefined || p.rangeB !== undefined, 'hay que indicar al menos un tramo');

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

/** El valor que llegó en `path` — para decir QUÉ llegó, no solo qué se esperaba. */
function valorEn(params: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  let cursor: unknown = params;
  for (const paso of path) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<PropertyKey, unknown>)[paso];
  }
  return cursor;
}

/**
 * Un issue de zod en el MISMO vocabulario que emite `ToolRegistry.validate()`
 * (#1194). Las dos ramas de `execute()` hablaban dialectos distintos: la de zod
 * perdía el nombre del campo —cuatro 'Invalid input: expected string, received
 * undefined' idénticos para cuatro campos distintos— y eso no es idioma, es
 * información que ninguna traducción posterior recupera.
 *
 * Los mensajes escritos a mano (refines, `.min`) salen verbatim: los escribió
 * alguien para que se leyeran, y ya están en español.
 */
function aFormaCanonica(issue: z.core.$ZodIssue, params: unknown): string {
  const campo = issue.path.join('.');
  if (!campo) return issue.message;

  // Un dato que no llegó y uno vacío son el mismo hueco para quien lo lee.
  const valor = valorEn(params, issue.path);
  if (valor === undefined || valor === null || valor === '') {
    return `Missing required parameter: "${campo}"`;
  }

  if (issue.code === 'invalid_type') {
    const recibido = Array.isArray(valor) ? 'array' : typeof valor;
    return `Parameter "${campo}" must be ${issue.expected}, got ${recibido}`;
  }

  if (issue.code === 'invalid_value') {
    return `Parameter "${campo}" must be one of: ${issue.values.join(', ')}`;
  }

  return issue.message;
}

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
      error: result.error.issues.map(i => aFormaCanonica(i, params)).join(', '),
    };
  }
  return { success: true, data: result.data };
}
