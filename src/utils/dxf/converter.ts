/**
 * Convert DXF entities to Vina PatternPiece objects.
 */
import { PatternPiece, PathCommand, InternalLine } from '../../types/types';
import {
  DXFDocument, DXFEntity, DXFInsertData, DXFLineData,
  DXFLWPolylineData, DXFPolylineData, DXFSplineData,
  DXFArcData, DXFCircleData, DXFTextData, DXFPointData, layerRole,
} from './types';
import type { FormatProfile, LayerRole } from './types';
import { grainAlignmentRotation } from '../grainLine';
import { flattenPath } from '../seam';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../notches';
import { computeNotchAnchor } from '../notchAnchor';

/**
 * Sanitize a piece name lifted from an untrusted DXF TEXT entity. Names flow
 * into the copilot's LLM system prompt, so strip control chars / newlines (which
 * a crafted file uses to fake role labels — indirect prompt injection) and cap
 * length, mirroring the null-byte + MAX_NAME_LEN guards the zod `.openclo` path
 * already enforces.
 */
function cleanImportedName(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

// ─── Entity → PathCommand[] conversion ───

/**
 * Convert a single DXF entity to an array of SVG-style path commands.
 *
 * Supports LINE, LWPOLYLINE, POLYLINE (with bulge arcs), SPLINE, ARC, and CIRCLE.
 * Unsupported entity types return an empty array.
 *
 * @param entity - The DXF entity to convert
 * @returns Array of path commands representing the entity geometry
 */
export function entityToPath(entity: DXFEntity): PathCommand[] {
  switch (entity.type) {
    case 'LINE': return lineToPath(entity.data as DXFLineData);
    case 'LWPOLYLINE': return lwpolylineToPath(entity.data as DXFLWPolylineData);
    case 'POLYLINE': return polylineToPath(entity.data as DXFPolylineData);
    case 'SPLINE': return splineToPath(entity.data as DXFSplineData);
    case 'ARC': return arcToPath(entity.data as DXFArcData);
    case 'CIRCLE': return circleToPath(entity.data as DXFCircleData);
    case 'POINT': return pointToPath(entity.data as DXFPointData);
    default: return [];
  }
}

function lineToPath(d: DXFLineData): PathCommand[] {
  return [
    { type: 'M', values: [d.x1, d.y1] },
    { type: 'L', values: [d.x2, d.y2] },
  ];
}

/**
 * POINT → 6-unit vertical tick centered on the point — the same marker shape
 * the TEXT-on-notch-layer path produces. CLO/AAMA exports emit notches and
 * drill holes as POINT entities on layer 4 (consumed only when the layer
 * role is 'notch'; construction POINTs on layers 2/3 are skipped upstream).
 */
function pointToPath(d: DXFPointData): PathCommand[] {
  return [
    { type: 'M', values: [d.x, d.y - 3] },
    { type: 'L', values: [d.x, d.y + 3] },
  ];
}

function lwpolylineToPath(d: DXFLWPolylineData): PathCommand[] {
  return polyVertexToPath(d.vertices, d.closed);
}

function polylineToPath(d: DXFPolylineData): PathCommand[] {
  return polyVertexToPath(d.vertices, d.closed);
}

function polyVertexToPath(vertices: { x: number; y: number; bulge: number }[], closed: boolean): PathCommand[] {
  if (vertices.length === 0) return [];
  const cmds: PathCommand[] = [{ type: 'M', values: [vertices[0].x, vertices[0].y] }];

  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    if (i === vertices.length - 1 && !closed) break;

    // NO deduplicar los vértices coincidentes de CLO: son semánticos — marcan
    // los puntos reales del patrón (anchorRoles los clasifica corner/lineEnd
    // frente a smoothSample). El dedupe vive en el consumidor que no los
    // tolera (buildOffsetEdges, maria-202), nunca aquí. Ver el contrato en
    // anchorRoles.maria.test.ts.

    if (Math.abs(v.bulge) < 1e-10) {
      cmds.push({ type: 'L', values: [next.x, next.y] });
    } else {
      // Convert bulge to arc, then approximate as cubic bezier
      const bulgeArcCmds = bulgeToArc(v.x, v.y, next.x, next.y, v.bulge);
      cmds.push(...bulgeArcCmds);
    }
  }

  if (closed) cmds.push({ type: 'Z', values: [] });
  return cmds;
}

/** Convert a LWPOLYLINE bulge between two points to bezier approximation */
function bulgeToArc(x1: number, y1: number, x2: number, y2: number, bulge: number): PathCommand[] {
  const angle = 4 * Math.atan(Math.abs(bulge));
  const dx = x2 - x1, dy = y2 - y1;
  const chord = Math.sqrt(dx * dx + dy * dy);
  if (chord < 1e-10) return [{ type: 'L', values: [x2, y2] }];

  const sagitta = Math.abs(bulge) * chord / 2;
  void sagitta; // reserved for future use
  const radius = (chord / 2) / Math.sin(angle / 2);

  // Midpoint of chord
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  // Normal to chord
  const nx = -dy / chord, ny = dx / chord;
  const sign = bulge > 0 ? 1 : -1;
  const d = radius * Math.cos(angle / 2);
  const cx = mx + sign * d * nx;
  const cy = my + sign * d * ny;

  // Approximate arc as cubic bezier
  // For small arcs, single bezier is fine
  const alpha = (4 / 3) * Math.tan(angle / 4);
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  const a2 = Math.atan2(y2 - cy, x2 - cx);

  const cp1x = x1 - alpha * radius * Math.sin(a1) * sign;
  const cp1y = y1 + alpha * radius * Math.cos(a1) * sign;
  const cp2x = x2 + alpha * radius * Math.sin(a2) * sign;
  const cp2y = y2 - alpha * radius * Math.cos(a2) * sign;

  return [{ type: 'C', values: [cp1x, cp1y, cp2x, cp2y, x2, y2] }];
}

function splineToPath(d: DXFSplineData): PathCommand[] {
  const pts = d.controlPoints;
  if (pts.length < 2) return [];

  const cmds: PathCommand[] = [{ type: 'M', values: [pts[0].x, pts[0].y] }];

  if (d.degree === 3) {
    // Cubic bezier segments: every 3 control points after the first
    for (let i = 1; i + 2 < pts.length; i += 3) {
      cmds.push({
        type: 'C',
        values: [pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, pts[i + 2].x, pts[i + 2].y],
      });
    }
  } else {
    // Fallback: connect with lines
    for (let i = 1; i < pts.length; i++) {
      cmds.push({ type: 'L', values: [pts[i].x, pts[i].y] });
    }
  }
  if (d.closed) cmds.push({ type: 'Z', values: [] });
  return cmds;
}

function arcToPath(d: DXFArcData): PathCommand[] {
  const startRad = (d.startAngle * Math.PI) / 180;
  const endRad = (d.endAngle * Math.PI) / 180;
  const x1 = d.cx + d.radius * Math.cos(startRad);
  const y1 = d.cy + d.radius * Math.sin(startRad);
  const x2 = d.cx + d.radius * Math.cos(endRad);
  const y2 = d.cy + d.radius * Math.sin(endRad);

  let sweep = endRad - startRad;
  if (sweep <= 0) sweep += 2 * Math.PI;

  const alpha = (4 / 3) * Math.tan(sweep / 4);
  const cp1x = x1 - alpha * d.radius * Math.sin(startRad);
  const cp1y = y1 + alpha * d.radius * Math.cos(startRad);
  const cp2x = x2 + alpha * d.radius * Math.sin(endRad);
  const cp2y = y2 - alpha * d.radius * Math.cos(endRad);

  return [
    { type: 'M', values: [x1, y1] },
    { type: 'C', values: [cp1x, cp1y, cp2x, cp2y, x2, y2] },
  ];
}

function circleToPath(d: DXFCircleData): PathCommand[] {
  const { cx, cy, radius: r } = d;
  const k = 0.5522847498; // (4/3)*tan(π/8)
  return [
    { type: 'M', values: [cx + r, cy] },
    { type: 'C', values: [cx + r, cy + k * r, cx + k * r, cy + r, cx, cy + r] },
    { type: 'C', values: [cx - k * r, cy + r, cx - r, cy + k * r, cx - r, cy] },
    { type: 'C', values: [cx - k * r, cy - r, cx, cy - k * r, cx + r, cy - r] },
    { type: 'C', values: [cx + r, cy - k * r, cx + r, cy, cx + r, cy] }, // close back
    { type: 'Z', values: [] },
  ];
}

// ─── Geometric notch classification ───

const NOTCH_MAX_LENGTH = 15; // mm

function computePathLength(path: PathCommand[]): number {
  let length = 0;
  let cx = 0, cy = 0;
  for (const cmd of path) {
    if (cmd.type === 'M') {
      cx = cmd.values[0]; cy = cmd.values[1];
    } else if (cmd.type === 'L') {
      const dx = cmd.values[0] - cx, dy = cmd.values[1] - cy;
      length += Math.sqrt(dx * dx + dy * dy);
      cx = cmd.values[0]; cy = cmd.values[1];
    } else if (cmd.type === 'C') {
      const dx = cmd.values[4] - cx, dy = cmd.values[5] - cy;
      length += Math.sqrt(dx * dx + dy * dy);
      cx = cmd.values[4]; cy = cmd.values[5];
    }
  }
  return length;
}

// ─── Y-flip: DXF Y-up → screen Y-down ───

function flipPathY(cmds: PathCommand[]): PathCommand[] {
  return cmds.map(cmd => ({
    type: cmd.type,
    values: cmd.values.map((v, i) => i % 2 === 1 ? -v : v),
  }));
}

// ─── Transform path by INSERT (translate, scale, rotate) ───

function transformPath(cmds: PathCommand[], insert: DXFInsertData): PathCommand[] {
  const rad = (insert.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return cmds.map(cmd => ({
    type: cmd.type,
    values: cmd.values.map((v, i) => {
      if (cmd.values.length < 2) return v;
      const pairIdx = Math.floor(i / 2) * 2;
      const x = cmd.values[pairIdx];
      const y = cmd.values[pairIdx + 1];
      const sx = x * insert.scaleX;
      const sy = y * insert.scaleY;
      const rx = sx * cos - sy * sin + insert.x;
      const ry = sx * sin + sy * cos + insert.y;
      return i % 2 === 0 ? rx : ry;
    }),
  }));
}

// ─── Import Options ───

export interface DXFImportOptions {
  unit?: 'mm' | 'cm' | 'inch' | 'auto';
  scale?: number;  // percentage, default 100
  importNotches?: boolean;
  importGrainlines?: boolean;
  importInternalLines?: boolean;
  /** Rotate each piece so its grainline is vertical on import (default true).
   *  The canonical orientation a patronista reads. No-op for pieces without a
   *  grainline. */
  alignToGrainline?: boolean;
  formatProfile?: FormatProfile;
}

const UNIT_FACTORS: Record<string, number> = { mm: 1, cm: 10, inch: 25.4 };

function resolveUnitFactor(unit: string | undefined, doc: DXFDocument): number {
  if (!unit || unit === 'auto') {
    const insunits = doc.header.get('$INSUNITS');
    const code = typeof insunits === 'number' ? insunits : parseInt(String(insunits), 10);
    if (code === 1) return UNIT_FACTORS.inch;
    if (code === 5) return UNIT_FACTORS.cm;
    return 1; // default mm
  }
  return UNIT_FACTORS[unit] ?? 1;
}

// ─── Main Converter ───

/**
 * Convert a parsed DXF document into Vina pattern pieces.
 *
 * If the document contains blocks, each block becomes a piece (with INSERT
 * transforms applied). Otherwise, all entities are treated as a single piece.
 * Entities are classified by AAMA layer role: cut lines form the outline,
 * while notch, grainline, and draw layers become internal lines.
 *
 * @param doc - Parsed DXF document from {@link parseDXF}
 * @param options - Optional import options for unit, scale, and filters
 * @returns Array of pattern pieces with outlines, internals, and metadata
 */
export function dxfToPatternPieces(doc: DXFDocument, options?: DXFImportOptions): PatternPiece[] {
  const pieces: PatternPiece[] = [];

  // Resolved up front: notch geometry is generated inside `entitiesToPiece`
  // in FILE units, sized so the scaling below lands it at the default mm.
  const unitFactor = resolveUnitFactor(options?.unit, doc);
  const scaleFactor = ((options?.scale ?? 100) / 100) * unitFactor;

  if (doc.blocks.size > 0) {
    // Each block (possibly referenced by INSERT) = one piece
    const inserts = doc.entities.filter(e => e.type === 'INSERT');

    for (const [blockName, block] of doc.blocks) {
      const insert = inserts.find(e => (e.data as DXFInsertData).blockName === blockName);
      const insertData: DXFInsertData = insert
        ? insert.data as DXFInsertData
        : { blockName, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };

      let piece = entitiesToPiece(block.entities, blockName, insertData, options?.formatProfile, scaleFactor);
      if (piece) {
        if (options?.formatProfile?.convertHook) {
          piece = options.formatProfile.convertHook(piece, block.entities);
        }
        pieces.push(piece);
      }
    }
  } else {
    // No blocks: group by entities, treat as single piece
    let piece = entitiesToPiece(doc.entities, 'Imported Piece', null, options?.formatProfile, scaleFactor);
    if (piece) {
      if (options?.formatProfile?.convertHook) {
        piece = options.formatProfile.convertHook(piece, doc.entities);
      }
      pieces.push(piece);
    }
  }

  // Apply scale and unit

  if (scaleFactor !== 1) {
    for (const piece of pieces) {
      piece.outline = piece.outline.map(cmd => ({
        type: cmd.type,
        values: cmd.values.map(v => v * scaleFactor),
      }));
      piece.internals = piece.internals.map(internal => ({
        ...internal,
        path: internal.path.map(cmd => ({
          type: cmd.type,
          values: cmd.values.map(v => v * scaleFactor),
        })),
      }));
    }
  }

  // Grain-align (default on): rotate each piece so its grainline is vertical —
  // the canonical orientation a patronista reads. Non-destructive (sets
  // piece.rotation, honored by render/export/nesting/3D); no-op without a
  // grainline. Computed before the grainline filter below so it still aligns
  // when grainlines are imported-but-hidden.
  if (!options || options.alignToGrainline !== false) {
    for (const piece of pieces) {
      piece.rotation = grainAlignmentRotation(piece);
    }
  }

  // Apply import filters
  if (options) {
    for (const piece of pieces) {
      piece.internals = piece.internals.filter(internal => {
        if (internal.type === 'notch' && options.importNotches === false) return false;
        if (internal.type === 'grainline' && options.importGrainlines === false) return false;
        if ((internal.type === 'dart' || internal.type === 'reference' || internal.type === 'topstitch') && options.importInternalLines === false) return false;
        return true;
      });
    }
  }

  return pieces;
}

function resolveLayerRole(layerName: string, profile?: FormatProfile): LayerRole {
  const normalized = layerName.toUpperCase();
  if (profile) {
    if (profile.layerMap[normalized]) return profile.layerMap[normalized];
    for (const { pattern, role } of profile.layerPatterns) {
      if (pattern.test(layerName)) return role;
    }
  }
  return layerRole(layerName);
}

/** Apply an INSERT transform (scale → rotate → translate) to a raw point. */
function applyInsert(x: number, y: number, insert: DXFInsertData): { x: number; y: number } {
  const rad = (insert.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const sx = x * insert.scaleX, sy = y * insert.scaleY;
  return { x: sx * cos - sy * sin + insert.x, y: sx * sin + sy * cos + insert.y };
}

function entitiesToPiece(
  entities: DXFEntity[],
  defaultName: string,
  insertData: DXFInsertData | null,
  profile?: FormatProfile,
  mmPerUnit: number = 1,
): PatternPiece | null {
  let outline: PathCommand[] = [];
  // Unmapped-layer geometry. Only used as the outline when NO cut-role entity
  // exists (plain DXFs without layer semantics). When a cut outline exists,
  // unknown layers must never glue onto it — CLO vendor layers (84/85) used to
  // corrupt the boundary with a second overlapping contour this way.
  const unknownOutline: PathCommand[] = [];
  const internals: InternalLine[] = [];
  // Position-only notch markers (POINT / TEXT on the notch layer), in final
  // (insert-transformed, Y-flipped) coordinates. Interpreted against the
  // FINISHED outline at the end of this function (hallazgo #5).
  const notchMarks: { x: number; y: number }[] = [];
  let name = defaultName;

  // Find piece name from TEXT entities — prefer "Piece Name: XXX" (AAMA convention)
  for (const e of entities) {
    if (e.type === 'TEXT' || e.type === 'MTEXT') {
      const text = (e.data as DXFTextData).text.trim();
      const match = text.match(/^Piece\s*Name:\s*(.+)/i);
      if (match) { name = cleanImportedName(match[1]); break; }
    }
  }
  // Fallback: first non-label, non-notch text
  if (name === defaultName) {
    for (const e of entities) {
      if (e.type === 'TEXT' || e.type === 'MTEXT') {
        const text = (e.data as DXFTextData).text.trim();
        if (text && !text.match(/^#\s*\d+$/) && !text.match(/^Piece\s*Name:/i) && !text.match(/^Size\s/i)) {
          name = cleanImportedName(text); break;
        }
      }
    }
  }

  // Collect notch marks from TEXT entities on notch layer (AAMA layer 4)
  for (const e of entities) {
    if ((e.type === 'TEXT' || e.type === 'MTEXT') && resolveLayerRole(e.layer, profile) === 'notch') {
      const td = e.data as DXFTextData;
      const p = insertData ? applyInsert(td.x, td.y, insertData) : { x: td.x, y: td.y };
      notchMarks.push({ x: p.x, y: -p.y }); // Y-flip
    }
  }

  // Group geometry entities by layer role
  for (const e of entities) {
    if (e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'INSERT') continue;
    const role = resolveLayerRole(e.layer, profile);
    // POINTs are markers, not geometry: notch-layer POINTs are collected as
    // notch marks (interpreted against the finished outline below);
    // construction points (CLO layers 2/3: turn/curve-fit) are noise.
    if (e.type === 'POINT') {
      if (role === 'notch') {
        const pd = e.data as DXFPointData;
        const p = insertData ? applyInsert(pd.x, pd.y, insertData) : { x: pd.x, y: pd.y };
        notchMarks.push({ x: p.x, y: -p.y }); // Y-flip
      }
      continue;
    }
    let path = entityToPath(e);
    if (path.length === 0) continue;

    if (insertData) {
      path = transformPath(path, insertData);
    }

    switch (role) {
      case 'cut':
        // Use first cut-layer entity as outline, or accumulate segments
        if (outline.length === 0) {
          outline = path;
        } else {
          outline.push(...path);
        }
        break;
      case 'unknown':
        unknownOutline.push(...path);
        break;
      case 'notch': {
        const flipped = flipPathY(path);
        const len = computePathLength(path);
        if (len > 0 && len <= NOTCH_MAX_LENGTH) {
          internals.push({
            id: crypto.randomUUID(),
            type: 'notch',
            path: flipped,
            notchOptions: {
              shape: 'slit',
              subType: 'straightforward',
              length: 8,
              width: 3,
              angle: 0,
              count: 1,
            },
          });
        } else {
          internals.push({ id: crypto.randomUUID(), type: 'notch', path: flipped });
        }
        break;
      }
      case 'grainline':
        internals.push({ id: crypto.randomUUID(), type: 'grainline', path: flipPathY(path) });
        break;
      case 'draw':
      case 'intcut':
        // Líneas internas genéricas: estilo, colocación de bolsillo, cortes
        // internos. NO son pinzas — marcarlas type:'dart' hacía que
        // extractDarts() las leyera como tales y el validador avisara sobre
        // bolsillos (#1020). 'reference' renderiza punteado y exporta a AAMA.
        internals.push({ id: crypto.randomUUID(), type: 'reference', path: flipPathY(path) });
        break;
      case 'dart':
        internals.push({ id: crypto.randomUUID(), type: 'dart', path: flipPathY(path) });
        break;
      case 'seam':
        // Sew/seam line (AAMA 84 / ASTM "SEW LINE" / Lectra "COUTURE") —
        // display fidelity the patternmaker expects; never part of the outline.
        internals.push({ id: crypto.randomUUID(), type: 'seam', path: flipPathY(path) });
        break;
      case 'label':
        break; // skip for now
    }
  }

  // Fallback: no cut-role geometry at all → assemble the outline from
  // unmapped layers (pre-existing behavior for plain/profile-less DXFs).
  if (outline.length === 0 && unknownOutline.length > 0) {
    outline = unknownOutline;
  }

  if (outline.length === 0) return null;

  // Flip Y for outline
  outline = flipPathY(outline);

  // Hallazgo #3 (María): CLO exports the cut boundary as a COARSE polyline
  // while the sew line (84) carries the SAME curve at ~7x resolution. On a
  // net pattern both trace one curve — drawing both gives an ugly faceted
  // double contour. When a denser sew line geometrically coincides with the
  // cut boundary, it IS the better sample of the outline: promote it and
  // drop the duplicate internal. An OFFSET sew line (baked seam allowance)
  // never coincides, so it stays an internal — cut geometry is untouched.
  outline = promoteDenseSeamOutline(outline, internals);

  // Hallazgo #5 (María): a notch POINT on the boundary is a real notch, not
  // a generic tick — project it onto the finished outline and build it with
  // the native notch model (perpendicular, inward, notchOptions).
  for (const mark of notchMarks) {
    internals.push(interpretNotchMark(mark, outline, mmPerUnit));
  }

  return {
    id: crypto.randomUUID(),
    name,
    outline,
    internals,
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    // Provenance: a DXF boundary layer IS the cut contour. Suppresses the
    // synthetic seam-allowance default — never invent a margin the file
    // does not carry (junta F1).
    outlineIsCutLine: true,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Dense sew-line outline promotion (hallazgo #3) ───

/**
 * Coincidence tolerance as a fraction of the outline bbox diagonal —
 * unit-independent (DXF files arrive in mm, cm, or inches before scaling).
 * Cut vertices in a CLO export lie ON the sew curve, so their distance to
 * the dense sew polyline is ≈ its chord sagitta (near zero); a baked seam
 * allowance offsets the sew line by ≥5mm — orders of magnitude above this.
 */
const SEAM_PROMOTION_TOLERANCE_RATIO = 0.002;

function distPointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when EVERY point lies within `tol` of the polyline — early-exits. */
function everyPointNearPolyline(
  pts: { x: number; y: number }[],
  poly: { x: number; y: number }[],
  tol: number,
): boolean {
  outer: for (const p of pts) {
    for (let i = 0; i < poly.length - 1; i++) {
      if (distPointToSegment(p, poly[i], poly[i + 1]) <= tol) continue outer;
    }
    return false;
  }
  return true;
}

// ─── Notch-mark interpretation (hallazgo #5) ───

/**
 * Max distance from a notch mark to the outline (as a fraction of the bbox
 * diagonal) for it to count as an EDGE notch. CLO marks sit exactly on the
 * boundary; drill holes / internal markers sit well inside and keep the
 * legacy position tick instead — we never invent an edge anchor.
 */
const NOTCH_EDGE_SNAP_RATIO = 0.01;

/** Closest point on a polyline to `pt`, with the segment's unit tangent. */
function projectOntoPolyline(
  pt: { x: number; y: number },
  poly: { x: number; y: number }[],
): { point: { x: number; y: number }; tangent: { x: number; y: number }; dist: number } | null {
  let best: { point: { x: number; y: number }; tangent: { x: number; y: number }; dist: number } | null = null;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq));
    const px = a.x + t * dx, py = a.y + t * dy;
    const d = Math.hypot(pt.x - px, pt.y - py);
    if (!best || d < best.dist) {
      const len = Math.sqrt(lenSq);
      best = { point: { x: px, y: py }, tangent: { x: dx / len, y: dy / len }, dist: d };
    }
  }
  return best;
}

/** Ray-casting point-in-polygon over a flattened outline. */
function pointInPolygon(pt: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) &&
        pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Turn a position-only notch mark into a real notch internal. On-boundary
 * marks get the native notch model: projected onto the outline, oriented
 * along the INWARD edge normal, sized via DEFAULT_NOTCH_OPTIONS (mm —
 * divided by `mmPerUnit` so the later unit scaling lands it at exactly the
 * default size). Off-boundary marks (drill holes) keep the legacy 6-unit
 * vertical tick.
 */
function interpretNotchMark(
  mark: { x: number; y: number },
  outline: PathCommand[],
  mmPerUnit: number,
): InternalLine {
  const poly = flattenPath(outline);
  const proj = poly.length >= 3 ? projectOntoPolyline(mark, poly) : null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);
  const tol = diag * NOTCH_EDGE_SNAP_RATIO;

  if (!proj || proj.dist > tol || !(mmPerUnit > 0)) {
    // Drill hole / internal marker — position tick, exactly as before.
    return {
      id: crypto.randomUUID(),
      type: 'notch',
      path: [
        { type: 'M', values: [mark.x, mark.y - 3] },
        { type: 'L', values: [mark.x, mark.y + 3] },
      ],
    };
  }

  // Inward normal: of the two edge perpendiculars, the one whose probe
  // point lands inside the outline.
  const eps = Math.max(tol, 1e-6);
  let normal = { x: -proj.tangent.y, y: proj.tangent.x };
  if (!pointInPolygon({ x: proj.point.x + normal.x * eps, y: proj.point.y + normal.y * eps }, poly)) {
    normal = { x: proj.tangent.y, y: -proj.tangent.x };
  }

  const opts = DEFAULT_NOTCH_OPTIONS;

  // Back-fill the parametric anchor (notch-precision F2): the projection is
  // already computed right here — persist it so the precision modal can read
  // the placement back. Stored in FINAL units (× mmPerUnit) because the
  // generic scaling loop in dxfToPatternPieces scales paths only, never data
  // fields. Cornerless outlines yield null → the notch stays anchor-less.
  const anchor = computeNotchAnchor(outline, proj.point);

  return {
    id: crypto.randomUUID(),
    type: 'notch',
    path: generateNotchPath(proj.point, normal, {
      ...opts,
      length: opts.length / mmPerUnit,
      width: opts.width / mmPerUnit,
    }),
    notchOptions: { ...opts },
    ...(anchor ? {
      notchAnchor: {
        refPoint: { x: anchor.refPoint.x * mmPerUnit, y: anchor.refPoint.y * mmPerUnit },
        direction: anchor.direction,
        distanceMm: anchor.distanceMm * mmPerUnit,
        ...(anchor.metric !== undefined ? { metric: anchor.metric } : {}),
      },
    } : {}),
  };
}

/**
 * When a `'seam'` internal is a DENSER sample of the SAME curve as the cut
 * outline (net pattern — sew line and cut line coincide), promote it to be
 * the outline and remove the duplicate internal. Returns the (possibly
 * replaced) outline; mutates `internals` on promotion.
 */
function promoteDenseSeamOutline(outline: PathCommand[], internals: InternalLine[]): PathCommand[] {
  const outlinePts = flattenPath(outline);
  if (outlinePts.length < 3) return outline;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outlinePts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const tol = Math.hypot(maxX - minX, maxY - minY) * SEAM_PROMOTION_TOLERANCE_RATIO;
  if (tol <= 0) return outline;

  for (let i = 0; i < internals.length; i++) {
    const line = internals[i];
    if (line.type !== 'seam') continue;
    const seamPts = flattenPath(line.path);
    if (seamPts.length <= outlinePts.length) continue; // not a denser sample
    if (!everyPointNearPolyline(outlinePts, seamPts, tol)) continue; // offset or partial
    // Promote: the dense sew path becomes the boundary; ensure closure.
    const promoted = [...line.path];
    if (promoted[promoted.length - 1]?.type !== 'Z') promoted.push({ type: 'Z', values: [] });
    internals.splice(i, 1);
    return promoted;
  }
  return outline;
}
