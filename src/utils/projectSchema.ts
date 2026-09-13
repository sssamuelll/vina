/**
 * VinaProject — structural parser for untrusted project payloads.
 *
 * The boundary: every place where a JSON blob from disk or IndexedDB autosave
 * is cast `as VinaProject`. This module replaces those casts with a zod
 * parse that returns a Result. Semantic repair (cross-references, outline
 * closure) stays in `projectValidator.ts` and runs *after* this parser
 * accepts the payload.
 *
 * Forward-compat: container shapes use `.loose()` so future fields written by
 * a newer build survive the round-trip on an older build (no silent data
 * loss). DoS: arrays and strings have hard upper bounds — payloads that
 * exceed them are rejected with `code: 'too_large'`.
 *
 * @module projectSchema
 */
import { z } from 'zod';
import type { VinaProject, InternalLineType } from '../types/types';

// ─── DoS bounds ──────────────────────────────────────────────────────────────
// Real patterns: <500 pieces, <1000 outline cmds. Margins are 10–20×.
const MAX_PIECES = 10_000;
const MAX_SEAMS = 50_000;
const MAX_OUTLINE_CMDS = 10_000;
const MAX_INTERNALS_PER_PIECE = 5_000;
const MAX_EDGES_PER_PIECE = 5_000;
const MAX_PATH_VALUES = 64;
const MAX_FABRICS = 1_000;
const MAX_GROUPS = 1_000;
const MAX_POMS = 5_000;
const MAX_SEAM_GROUPS = 10_000;
const MAX_NOTCH_PAIRS = 50_000;
const MAX_REFERENCE_IMAGES = 200;
const MAX_TRIMS = 5_000;
// ponytail: tope generoso a propósito. La spec § 7 cuenta con cientos de trazos
// por proyecto, y quien se cansa primero no es el archivo sino el índice de
// enganche (§ 5.1). Esto es una cota anti-DoS, no un límite de producto: si
// hace falta frenar antes, se frena donde se mide, no aquí.
const MAX_TRAZOS = 2_000;

const MAX_NAME_LEN = 1024;
const MAX_ID_LEN = 1024;
const MAX_URL_LEN = 4096;
const MAX_DESCRIPTION_LEN = 16_384;
const MAX_NOTES_LEN = 16_384;

// 7.5MB binary ≈ 10MB base64 (4/3 expansion).
const MAX_DATA_URI_LEN = 10 * 1024 * 1024;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const noNullByte = (s: string) => !s.includes('\0');

const finiteNumber = z
  .number()
  .refine(Number.isFinite, { message: 'must be finite (no NaN/Infinity)' });

const boundedString = (max: number) =>
  z
    .string()
    .max(max, { message: `must be <= ${max} chars` })
    .refine(noNullByte, { message: 'contains null byte' });

const requiredString = (max: number) =>
  z
    .string()
    .min(1, { message: 'must be non-empty' })
    .max(max, { message: `must be <= ${max} chars` })
    .refine(noNullByte, { message: 'contains null byte' });

const idString = requiredString(MAX_ID_LEN);
const nameString = boundedString(MAX_NAME_LEN);
const urlString = boundedString(MAX_URL_LEN).refine(
  (s) => !/^javascript:/i.test(s.trim()),
  { message: 'javascript: scheme is not allowed' },
);
const safeKey = z
  .string()
  .min(1)
  .max(MAX_ID_LEN)
  .refine(noNullByte, { message: 'contains null byte' })
  .refine((k) => !FORBIDDEN_KEYS.has(k), { message: 'forbidden key' });

const point2DSchema = z.object({ x: finiteNumber, y: finiteNumber });

const pathCommandTypes = ['M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A', 'Z'] as const;

// Cualquier valor que no sea exactamente `true` se LIMPIA a `undefined` en
// vez de tumbar el proyecto entero — un `authoredAnchor: false` escrito por
// un plugin viejo no puede volver `parseVinaProject` inservible al arranque.
const cleanTrueFlag = z.preprocess(
  (v) => (v === true ? true : undefined),
  z.literal(true).optional(),
);

const pathCommandSchema = z
  .object({
    type: z.enum(pathCommandTypes),
    values: z.array(finiteNumber).max(MAX_PATH_VALUES),
    authoredAnchor: cleanTrueFlag,
    manualBezier: cleanTrueFlag,
  })
  .loose();

// ─── Internal lines ──────────────────────────────────────────────────────────
// Record<InternalLineType, true> keeps this enum in COMPILE-TIME lockstep with
// the TS union (src/types/types.ts): a member added to InternalLineType but
// missing here is a tsc error, not a runtime quarantine of the user's autosave
// (found the hard way with M3.5's 'seam').
const internalLineTypeMap: Record<InternalLineType, true> = {
  dart: true,
  grainline: true,
  notch: true,
  fold: true,
  pleat: true,
  topstitch: true,
  reference: true,
  seam: true,
};
const internalLineTypes = Object.keys(internalLineTypeMap) as [InternalLineType, ...InternalLineType[]];

// Parametric notch anchor (notch-precision F1, spec 2026-06-07): unlike the
// style bags below (z.unknown()), the anchor gets a REAL schema — it is the
// data the precision modal reads back, and a malformed anchor silently
// breaking re-positioning is exactly the failure class this boundary exists
// to catch. Optional: legacy notches and off-boundary drill holes have none.
const notchAnchorSchema = z.object({
  refPoint: point2DSchema,
  direction: z.enum(['cw', 'ccw']),
  distanceMm: finiteNumber.refine((n) => n >= 0, { message: 'must be >= 0' }),
  metric: z.union([z.literal(1), z.literal(2)]).optional(),
});

const internalLineSchema = z
  .object({
    id: idString,
    type: z.enum(internalLineTypes),
    path: z.array(pathCommandSchema).max(MAX_OUTLINE_CMDS),
    notchOptions: z.unknown().optional(),
    notchAnchor: notchAnchorSchema.optional(),
    topstitchOptions: z.unknown().optional(),
    foldOptions: z.unknown().optional(),
    dartOptions: z.unknown().optional(),
  })
  .loose();

// ─── Semantic edges ──────────────────────────────────────────────────────────
const seamAllowanceSpanSchema = z
  .object({
    tStart: finiteNumber.refine((n) => n >= 0 && n <= 1, { message: 'must be in [0,1]' }),
    tEnd: finiteNumber.refine((n) => n >= 0 && n <= 1, { message: 'must be in [0,1]' }),
    width: finiteNumber.refine((n) => n >= 0, { message: 'must be >= 0' }),
  })
  .superRefine((span, ctx) => {
    if (span.tEnd <= span.tStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['tEnd'],
        message: 'must be greater than tStart',
      });
    }
  });

const seamAllowanceSpansSchema = z
  .array(seamAllowanceSpanSchema)
  .max(MAX_OUTLINE_CMDS)
  .superRefine((spans, ctx) => {
    const ordered = spans
      .map((span, index) => ({ span, index }))
      .sort((a, b) => a.span.tStart - b.span.tStart || a.span.tEnd - b.span.tEnd);

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (current.span.tStart < previous.span.tEnd) {
        ctx.addIssue({
          code: 'custom',
          path: [current.index],
          message: 'seam allowance spans must not overlap',
        });
      }
    }
  });

const semanticEdgeSchema = z
  .object({
    id: idString,
    name: requiredString(MAX_NAME_LEN),
    segmentRange: z.tuple([
      finiteNumber.refine(Number.isInteger, { message: 'must be an integer' }),
      finiteNumber.refine(Number.isInteger, { message: 'must be an integer' }),
    ]),
    edgeType: z.enum(['seam', 'fold', 'hem', 'opening', 'dart-leg', 'unknown']),
    matchHint: boundedString(MAX_NAME_LEN).optional(),
    length: finiteNumber.optional(),
    seamAllowanceWidth: finiteNumber.refine((n) => n >= 0, { message: 'must be >= 0' }).optional(),
    seamAllowanceSpans: seamAllowanceSpansSchema.optional(),
  })
  .loose();

// ─── PatternPiece ────────────────────────────────────────────────────────────
const patternPieceSchema = z
  .object({
    id: idString,
    name: nameString,
    outline: z.array(pathCommandSchema).max(MAX_OUTLINE_CMDS),
    internals: z.array(internalLineSchema).max(MAX_INTERNALS_PER_PIECE),
    position: point2DSchema,
    rotation: finiteNumber,
    mirrored: z.boolean(),
    seamAllowance: finiteNumber,
    outlineIsCutLine: z.boolean().optional(),
    edges: z.array(semanticEdgeSchema).max(MAX_EDGES_PER_PIECE).optional(),
    fabricId: boundedString(MAX_ID_LEN).optional(),
    fabricCode: boundedString(MAX_ID_LEN).optional(),
    constructionPieceId: boundedString(MAX_ID_LEN).optional(),
    linkedPieceId: boundedString(MAX_ID_LEN).optional(),
    linkMode: z.enum(['symmetry', 'instance']).optional(),
    category: boundedString(64).optional(),
    side: boundedString(64).optional(),
    zOrder: finiteNumber.optional(),
    layer: finiteNumber.optional(),
    sublayer: finiteNumber.optional(),
    bodyRegion: boundedString(MAX_NAME_LEN).optional(),
    locked: z.boolean().optional(),
    gradedSize: boundedString(64).optional(),
    interfacingType: boundedString(64).optional(),
    solidifyFactor: finiteNumber.optional(),
    pressurePa: finiteNumber.optional(),
    active: z.boolean(),
    createdAt: finiteNumber,
    updatedAt: finiteNumber,
    // `gradeRules` stays intentionally undeclared and passes through `.loose()`
    // without validation. An invalid nested anchor.metric therefore reaches
    // resolveNotchAnchor, where anything other than 2 silently degrades to v1:
    // the fail-safe direction is to preserve the point instead of moving it.
  })
  .loose();

// ─── Seam ────────────────────────────────────────────────────────────────────
const seamEndpointSchema = z
  .object({
    pieceId: idString,
    edgeName: boundedString(MAX_NAME_LEN),
    tStart: finiteNumber.optional(),
    tEnd: finiteNumber.optional(),
    /** Sewing direction (parity plan Fase 5) — only honored on pieceB. */
    reversed: z.boolean().optional(),
  })
  .loose();

const seamSchema = z
  .object({
    id: idString,
    pieceA: seamEndpointSchema,
    pieceB: seamEndpointSchema,
    type: z.enum(['standard', 'french', 'flat-felled', 'overlock']),
    tension: finiteNumber,
    strength: finiteNumber,
    active: z.boolean(),
    taped: z.boolean(),
    tapeWidth: finiteNumber,
    // Versión del motor de auto-cosido (staleness de seams IA) — .loose()
    // ya lo round-tripea; se declara por higiene de tipos/validación.
    sewEngine: finiteNumber.optional(),
  })
  .loose();

// ─── SeamGroup ───────────────────────────────────────────────────────────────
const seamGroupSchema = z
  .object({
    id: idString,
    edgesA: z.array(seamEndpointSchema).max(MAX_SEAMS),
    edgesB: z.array(seamEndpointSchema).max(MAX_SEAMS),
    type: z.enum(['standard', 'french', 'flat-felled', 'overlock']),
    tension: finiteNumber,
    strength: finiteNumber,
    active: z.boolean(),
    taped: z.boolean(),
    tapeWidth: finiteNumber,
  })
  .loose();

// ─── Fabric ──────────────────────────────────────────────────────────────────
const fabricSchema = z
  .object({
    id: idString,
    name: nameString,
    color: boundedString(64),
    textureUrl: urlString.optional(),
    weight: finiteNumber,
    stretch: finiteNumber,
    stiffness: finiteNumber,
    friction: finiteNumber,
  })
  .loose();

// ─── Body measurements ──────────────────────────────────────────────────────
// Optional fields (most are optional in BodyMeasurements). Use loose so
// future measurements survive the round-trip; declared ones must be finite.
const bodyMeasurementsSchema = z
  .object({
    height: finiteNumber,
    chest: finiteNumber,
    waist: finiteNumber,
    hips: finiteNumber,
    shoulder: finiteNumber,
    armLength: finiteNumber,
    inseam: finiteNumber,
  })
  .loose();

// ─── Avatar ──────────────────────────────────────────────────────────────────
const avatarSchema = z
  .object({
    id: idString,
    name: nameString,
    modelUrl: urlString,
    measurements: bodyMeasurementsSchema,
  })
  .loose();

// ─── Groups, POMs, GarmentInfo ──────────────────────────────────────────────
const pieceGroupSchema = z
  .object({
    id: idString,
    name: nameString,
    pieceIds: z.array(idString).max(MAX_PIECES),
    color: boundedString(64),
    createdAt: finiteNumber,
    updatedAt: finiteNumber,
  })
  .loose();

const pomPointSchema = z
  .object({
    pieceId: idString,
    edgeName: boundedString(MAX_NAME_LEN).optional(),
    t: finiteNumber.optional(),
    localPosition: point2DSchema,
  })
  .loose();

const pomSchema = z
  .object({
    id: idString,
    name: nameString,
    category: z.enum(['length', 'width', 'circumference', 'height', 'custom']),
    method: z.enum(['straight', 'alongEdge', 'circumference', 'height', 'surfaceTape']),
    pointA: pomPointSchema,
    pointB: pomPointSchema,
    value: finiteNumber,
    tolerance: finiteNumber.optional(),
    createdAt: finiteNumber,
    updatedAt: finiteNumber,
  })
  .loose();

const garmentInfoSchema = z
  .object({
    brand: boundedString(MAX_NAME_LEN).optional(),
    season: boundedString(MAX_NAME_LEN).optional(),
    styleNumber: boundedString(MAX_NAME_LEN).optional(),
    designer: boundedString(MAX_NAME_LEN).optional(),
    date: boundedString(MAX_NAME_LEN).optional(),
    notes: boundedString(MAX_NOTES_LEN).optional(),
    description: boundedString(MAX_DESCRIPTION_LEN).optional(),
  })
  .loose();

// ─── ReferenceImage ─────────────────────────────────────────────────────────
const referenceImageSchema = z
  .object({
    id: idString,
    filename: boundedString(MAX_NAME_LEN),
    width: finiteNumber,
    height: finiteNumber,
    position: point2DSchema,
    scale: finiteNumber,
    rotation: finiteNumber,
    opacity: finiteNumber,
    locked: z.boolean(),
    visible: z.boolean(),
    pixelsPerMm: finiteNumber.nullable(),
  })
  .loose();

// ─── Trazo (línea de construcción, spec 2026-09-12 § 2) ─────────────────────
// A propósito sin `.min(2)` ni filtro de `Z`: `parseVinaProject` rechaza el
// proyecto ENTERO cuando algo no pasa y no hay cuarentena de trazos; un `path`
// vacío o con `Z` no rompe nada aguas abajo (`anclasDeTrazo` lo salta,
// `tramoMasCercano` devuelve null).
const trazoSchema = z
  .object({
    id: idString,
    path: z.array(pathCommandSchema).max(MAX_OUTLINE_CMDS),
    createdAt: finiteNumber,
  })
  .loose();

// ─── Trim ───────────────────────────────────────────────────────────────────
const trimPlacementSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('edge'),
    edgeName: boundedString(MAX_NAME_LEN),
    tStart: finiteNumber,
    tEnd: finiteNumber,
  }),
  z.object({
    mode: z.literal('edge-points'),
    edgeName: boundedString(MAX_NAME_LEN),
    positions: z.array(finiteNumber).max(10_000),
  }),
  z.object({
    mode: z.literal('count'),
    quantity: finiteNumber,
  }),
  z.object({
    mode: z.literal('point'),
    positions: z.array(point2DSchema).max(10_000),
  }),
]);

const trimSchema = z
  .object({
    id: idString,
    pieceId: idString,
    type: boundedString(64),
    presetId: boundedString(MAX_ID_LEN).optional(),
    name: nameString,
    description: boundedString(MAX_DESCRIPTION_LEN),
    placement: trimPlacementSchema,
    material: boundedString(MAX_NAME_LEN),
    color: boundedString(64),
    size: finiteNumber,
    unitCost: finiteNumber,
    active: z.boolean(),
  })
  .loose();

// ─── Notch mirror pairs (Alcance B1) ────────────────────────────────────────
const notchPairEndpointSchema = z.object({
  pieceId: boundedString(MAX_ID_LEN),
  lineId: boundedString(MAX_ID_LEN),
});
const notchPairSchema = z
  .object({
    id: idString,
    a: notchPairEndpointSchema,
    b: notchPairEndpointSchema,
    seamId: boundedString(MAX_ID_LEN),
    invert: z.boolean(),
  })
  .loose();

// ─── Top-level VinaProject ───────────────────────────────────────────────
const vinaProjectSchema = z
  .object({
    id: idString,
    name: nameString,
    description: boundedString(MAX_DESCRIPTION_LEN).optional(),
    pieces: z.array(patternPieceSchema).max(MAX_PIECES),
    seams: z.array(seamSchema).max(MAX_SEAMS),
    fabrics: z.array(fabricSchema).max(MAX_FABRICS),
    avatar: avatarSchema,
    groups: z.array(pieceGroupSchema).max(MAX_GROUPS).optional(),
    poms: z.array(pomSchema).max(MAX_POMS).optional(),
    seamGroups: z.array(seamGroupSchema).max(MAX_SEAM_GROUPS).optional(),
    notchPairs: z.array(notchPairSchema).max(MAX_NOTCH_PAIRS).optional(),
    garmentInfo: garmentInfoSchema.optional(),
    referenceImages: z.array(referenceImageSchema).max(MAX_REFERENCE_IMAGES).optional(),
    trazos: z.array(trazoSchema).max(MAX_TRAZOS).optional(),
    trims: z.array(trimSchema).max(MAX_TRIMS).optional(),
    referenceImageData: z.record(safeKey, z.string().max(MAX_DATA_URI_LEN)).optional(),
    createdAt: finiteNumber,
    updatedAt: finiteNumber,
  })
  .loose();

// ─── Public API ─────────────────────────────────────────────────────────────
export interface ParseError {
  code: 'invalid_json' | 'invalid_shape' | 'too_large';
  message: string;
  /** Dot/bracket path to the offending field (e.g. "pieces[3].outline"). */
  path?: string;
  /** Truncated repr of the offending value (≤200 chars). No secrets. */
  received?: string;
}

export interface ParseWarning {
  code: 'orphan_image_data' | 'invalid_data_uri';
  message: string;
  path?: string;
}

export type ProjectParseResult =
  | { ok: true; project: VinaProject; warnings: ParseWarning[] }
  | { ok: false; error: ParseError };

const formatPath = (segments: ReadonlyArray<PropertyKey>): string => {
  let out = '';
  for (const s of segments) {
    if (typeof s === 'number') out += `[${s}]`;
    else out += out === '' ? String(s) : `.${String(s)}`;
  }
  return out;
};

const truncate = (v: unknown): string => {
  let s: string;
  try {
    s = typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  if (s == null) return 'undefined';
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
};

const isDataImageUri = (s: string): boolean => /^data:image\//i.test(s);

/**
 * Parse an arbitrary value into an VinaProject. Returns a Result; never
 * throws. Callers decide how to react to `ok: false` (toast, log, quarantine).
 */
export function parseVinaProject(input: unknown): ProjectParseResult {
  const result = vinaProjectSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue ? formatPath(issue.path) : undefined;
    const tooLarge = result.error.issues.some(
      (i) => i.code === 'too_big' && i.origin === 'array',
    );
    return {
      ok: false,
      error: {
        code: tooLarge ? 'too_large' : 'invalid_shape',
        message: issue ? issue.message : 'invalid project payload',
        path,
        received: issue ? truncate(issue.input) : undefined,
      },
    };
  }
  // Boundary cast: `.loose()` widens the inferred type with an index signature
  // for unknown keys; we narrow to VinaProject after zod has verified every
  // known field. Forward-compat extras survive at runtime.
  const parsed = result.data as VinaProject;
  const warnings = filterReferenceImageData(parsed);
  return { ok: true, project: parsed, warnings };
}

/**
 * Convenience: parse a JSON string. Wraps `parseVinaProject` and reports
 * JSON syntax errors with `code: 'invalid_json'`.
 */
export function parseVinaProjectJson(json: string): ProjectParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'invalid_json',
        message: e instanceof Error ? e.message : 'invalid JSON',
      },
    };
  }
  return parseVinaProject(raw);
}

/**
 * Drop entries in `referenceImageData` whose key does not match a known
 * imageId, or whose value is not a `data:image/*` URI. Mutates the project.
 * This is a security filter: prevents `data:text/html` or `javascript:`
 * masquerading as image blobs from reaching `<img src>` later.
 */
function filterReferenceImageData(project: VinaProject): ParseWarning[] {
  const data = project.referenceImageData;
  if (!data || typeof data !== 'object') return [];

  const knownIds = new Set((project.referenceImages ?? []).map((i) => i.id));
  const warnings: ParseWarning[] = [];
  const cleaned: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (!knownIds.has(key)) {
      warnings.push({
        code: 'orphan_image_data',
        message: `referenceImageData key "${key}" has no matching referenceImages entry; dropped`,
        path: `referenceImageData.${key}`,
      });
      continue;
    }
    if (typeof value !== 'string' || !isDataImageUri(value)) {
      warnings.push({
        code: 'invalid_data_uri',
        message: `referenceImageData["${key}"] is not a data:image/ URI; dropped`,
        path: `referenceImageData.${key}`,
      });
      continue;
    }
    cleaned[key] = value;
  }

  if (Object.keys(cleaned).length === 0) {
    delete project.referenceImageData;
  } else {
    project.referenceImageData = cleaned;
  }
  return warnings;
}

export const __testing = {
  MAX_PIECES,
  MAX_SEAMS,
  MAX_OUTLINE_CMDS,
  MAX_REFERENCE_IMAGES,
  MAX_TRAZOS,
  MAX_DATA_URI_LEN,
  MAX_ID_LEN,
  MAX_NAME_LEN,
  isDataImageUri,
};
