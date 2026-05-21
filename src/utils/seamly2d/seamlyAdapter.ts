/**
 * Seamly2D → Construction Engine Adapter
 *
 * Converts resolved Seamly2D pattern data (from constructionResolver)
 * into the Redux construction format (CPoint[], CCurve[], CPiece[]).
 *
 * This bridges the gap between the 42 real Seamly2D patterns and
 * our construction engine + piece builder pipeline.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { CPoint, CCurve, CPiece, PieceNode, CurveDefinition } from '../../types/construction';
import { resolveConstruction, type ConstructionStep } from './constructionResolver';
import { evaluateFormula, type FormulaContext } from './formulaEvaluator';
import { newId } from '../ids';

/** Seamly2D GetL: base handle length for old kAsm format (from vspline_p.h) */
function seamlyGetL(dist: number, kCurve: number): number {
  const radius = dist / Math.SQRT2;
  return kCurve * radius * (4 / 3) * Math.tan(Math.PI / 8);
}

// ─── Types from Seamly2D JSON ────────────────────────────────────────────────

interface SeamlyPieceNode {
  id: number;
  modelingId?: number;
  type: 'NodePoint' | 'NodeSpline' | 'NodeSplinePath';
  curveType?: 'spline' | 'splinePath';
  reverse?: boolean;
}

interface SeamlyPiece {
  name: string;
  closed: boolean;
  seamAllowance: number;
  width?: number;
  nodes: SeamlyPieceNode[];
}

interface IndexedPoint {
  id: string;
  point: CPoint;
}

function createSortedPointIndex(points: CPoint[]): IndexedPoint[] {
  return points
    .map((point) => ({ id: point.id, point }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function findPointById(index: IndexedPoint[], id: string): CPoint | undefined {
  let left = 0;
  let right = index.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const entry = index[mid];
    const compare = entry.id.localeCompare(id);
    if (compare === 0) return entry.point;
    if (compare < 0) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return undefined;
}

export interface SeamlyPattern {
  name: string;
  source?: string;
  unit?: string;
  measurements: {
    required: string[];
    defaults: Record<string, number>;
  };
  variables: Record<string, { formula: string; description?: string }>;
  construction: ConstructionStep[];
  pieces: SeamlyPiece[];
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export interface AdaptedConstruction {
  points: CPoint[];
  curves: CCurve[];
  pieces: CPiece[];
  variables: Record<string, number>;
  /** Steps that failed to resolve */
  errors: string[];
}

// B11-state: thin wrapper. Prefix ignored. Previous `let _counter = 0`
// removed — UUID makes it unnecessary.
function uid(_prefix: string): string {
  return newId();
}

/**
 * Convert a Seamly2D pattern JSON into our construction engine format.
 *
 * 1. Resolve all construction steps → concrete (x, y) coordinates
 * 2. Convert points → CPoint[]
 * 3. Convert splines → CCurve[]
 * 4. Convert piece definitions → CPiece[] with PieceNode[]
 */
export function adaptSeamlyPattern(
  pattern: SeamlyPattern,
  measurementOverrides?: Record<string, number>,
): AdaptedConstruction {
  const errors: string[] = [];

  // 1. Build formula context from measurements + variables
  const measurements: Record<string, number> = {
    ...pattern.measurements.defaults,
    ...measurementOverrides,
  };

  // Pre-resolve all Seamly2D variables (they can reference measurements + each other)
  const resolvedVars: Record<string, number> = {};
  const ctx: FormulaContext = { measurements, variables: resolvedVars };

  if (pattern.variables) {
    for (const [name, def] of Object.entries(pattern.variables)) {
      try {
        const val = evaluateFormula(def.formula, ctx);
        // Store with and without # prefix (Seamly2D uses both)
        const cleanName = name.replace(/^#/, '');
        resolvedVars[cleanName] = val;
        resolvedVars[name] = val;
      } catch {
        // Skip unresolvable variables
      }
    }
  }

  // 2. Resolve all construction points with pre-resolved variables
  const { points: resolvedPoints, stepCurves } = resolveConstruction(
    pattern.construction, ctx,
  );

  // 3. Build step lookup (id → step) and name lookup (id → name)
  const stepById = new Map(pattern.construction.map(s => [s.id, s]));

  // 4. Convert resolved points → CPoint[]
  const cPoints: CPoint[] = [];
  const pointIdMap = new Map<number, string>(); // seamly id → our CPoint id

  for (const [seamlyId, coords] of resolvedPoints.entries()) {
    const step = stepById.get(seamlyId);
    if (!step) continue;

    const cpId = uid('sp');
    pointIdMap.set(seamlyId, cpId);

    cPoints.push({
      id: cpId,
      label: step.name || `P${seamlyId}`,
      x: coords.x,
      y: coords.y,
      definition: { type: 'manual', x: coords.x, y: coords.y },
      visible: true,
      blockId: step.block || 'main',
    });
  }

  const cPointIndex = createSortedPointIndex(cPoints);

  // 5. Convert splines/splinePaths → CCurve[]
  const cCurves: CCurve[] = [];
  const curveIdMap = new Map<number, string>(); // seamly step id → our CCurve id

  for (const step of pattern.construction) {
    if (step.type === 'spline' && step.point1 != null && step.point4 != null) {
      const fromId = pointIdMap.get(step.point1);
      const toId = pointIdMap.get(step.point4);
      if (!fromId || !toId) continue;

      const fromPt = findPointById(cPointIndex, fromId);
      const toPt = findPointById(cPointIndex, toId);
      if (!fromPt || !toPt) continue;

      const cvId = uid('sc');
      curveIdMap.set(step.id, cvId);

      // Store as resolved cubicBezier (already computed by constructionResolver)
      // But we need the control points — reconstruct from angles
      const a1 = typeof step.angle1 === 'number' ? step.angle1 : 0;
      const a2 = typeof step.angle2 === 'number' ? step.angle2 : 0;
      const dist = Math.sqrt((toPt.x - fromPt.x) ** 2 + (toPt.y - fromPt.y) ** 2);
      const kCurve = (step as any).kCurve ?? 1;
      const l1 = typeof step.length1 === 'number' ? step.length1 :
                 typeof (step as any).kAsm1 === 'number' ? (step as any).kAsm1 * seamlyGetL(dist, kCurve) :
                 seamlyGetL(dist, kCurve);
      const l2 = typeof step.length2 === 'number' ? step.length2 :
                 typeof (step as any).kAsm2 === 'number' ? (step as any).kAsm2 * seamlyGetL(dist, kCurve) :
                 seamlyGetL(dist, kCurve);

      const definition: CurveDefinition = {
        type: 'spline',
        from: fromPt.label,
        to: toPt.label,
        angle1: a1,
        angle2: a2,
        length1: l1,
        length2: l2,
      };

      cCurves.push({
        id: cvId,
        label: step.name || `Spl_${fromPt.label}_${toPt.label}`,
        definition,
        visible: true,
        blockId: step.block || 'main',
      });
    }

    if (step.type === 'splinePath' && (step.nodes || step.pathPoints) && (step.nodes ?? step.pathPoints)!.length >= 2) {
      // A splinePath is a multi-segment spline — we split into individual curves
      const cvId = uid('sc');
      curveIdMap.set(step.id, cvId);

      // For piece building, we store the full path as a sequence of curves
      // We'll use the first/last point as from/to
      const pathNodes = step.nodes ?? step.pathPoints!;
      const firstNode = pathNodes[0];
      const lastNode = pathNodes[pathNodes.length - 1];
      const fromId = pointIdMap.get(firstNode.point);
      const toId = pointIdMap.get(lastNode.point);

      if (fromId && toId) {
        const fromPt = findPointById(cPointIndex, fromId);
        const toPt = findPointById(cPointIndex, toId);

        if (fromPt && toPt) {
          const kCurve = (step as any).kCurve ?? 1;
          // Resolve angles: prefer new format, fall back to old format
          const a1 = typeof firstNode.angle2 === 'number' ? firstNode.angle2 :
                     typeof (firstNode as any).angle === 'number' ? (firstNode as any).angle :
                     typeof firstNode.angle1 === 'number' ? firstNode.angle1 : 0;
          const a2 = typeof lastNode.angle1 === 'number' ? lastNode.angle1 :
                     typeof (lastNode as any).angle === 'number' ? ((lastNode as any).angle + 180) :
                     typeof lastNode.angle2 === 'number' ? lastNode.angle2 : 0;
          const dist = Math.sqrt((toPt.x - fromPt.x) ** 2 + (toPt.y - fromPt.y) ** 2);
          // Resolve lengths: prefer new format, fall back to kAsm
          const l1 = typeof firstNode.length2 === 'number' ? firstNode.length2 :
                     typeof (firstNode as any).kAsm2 === 'number' ? (firstNode as any).kAsm2 * seamlyGetL(dist, kCurve) :
                     seamlyGetL(dist, kCurve);
          const l2 = typeof lastNode.length1 === 'number' ? lastNode.length1 :
                     typeof (lastNode as any).kAsm1 === 'number' ? (lastNode as any).kAsm1 * seamlyGetL(dist, kCurve) :
                     seamlyGetL(dist, kCurve);

          // Get pre-resolved multi-segment commands from resolver
          const resolvedCmds = stepCurves.get(step.id);

          cCurves.push({
            id: cvId,
            label: step.name || `SplPath_${fromPt.label}_${toPt.label}`,
            definition: {
              type: 'spline',
              from: fromPt.label,
              to: toPt.label,
              angle1: a1,
              angle2: a2,
              length1: l1,
              length2: l2,
            },
            visible: true,
            blockId: step.block || 'main',
            resolvedCommands: resolvedCmds,
          });
        }
      }
    }
  }

  // 6. Convert pieces → CPiece[]
  const cPieces: CPiece[] = [];

  for (const seamlyPiece of pattern.pieces) {
    const nodes: PieceNode[] = [];
    let valid = true;

    for (let i = 0; i < seamlyPiece.nodes.length; i++) {
      const sNode = seamlyPiece.nodes[i];

      if (sNode.type === 'NodePoint') {
        const pointCId = pointIdMap.get(sNode.id);
        if (!pointCId) {
          errors.push(`Piece "${seamlyPiece.name}": point id ${sNode.id} not found`);
          valid = false;
          continue;
        }
        const point = findPointById(cPointIndex, pointCId);
        if (!point) { valid = false; continue; }

        nodes.push({
          pointId: point.label,
          connection: 'line', // default, will be updated if preceded by curve
          curveId: undefined,
        });
      } else if (sNode.type === 'NodeSpline' || sNode.type === 'NodeSplinePath') {
        // This is a curve node — it connects the previous point to the next point
        const curveOurId = curveIdMap.get(sNode.id);
        if (curveOurId && nodes.length > 0) {
          // Mark the previous node's connection as curve
          nodes[nodes.length - 1].connection = 'curve';
          nodes[nodes.length - 1].curveId = curveOurId;
          nodes[nodes.length - 1].reverse = sNode.reverse || false;
        }
      }
    }

    if (!valid || nodes.length < 3) {
      errors.push(`Piece "${seamlyPiece.name}": insufficient valid nodes (${nodes.length})`);
      continue;
    }

    cPieces.push({
      id: uid('cp'),
      name: seamlyPiece.name,
      nodes,
      seamAllowance: (seamlyPiece.width ?? seamlyPiece.seamAllowance ?? 1) * 10, // cm → mm
      closed: seamlyPiece.closed,
      blockId: 'main',
    });
  }

  // Convert pattern-space coordinates to mm (OpenClo's internal standard).
  //
  // #527: this used to be hardcoded `const CM_TO_MM = 10`, on the assumption that
  // every Seamly2D pattern is authored in cm. That is false — several real
  // patterns declare `"unit": "mm"` (e.g. jacket1_52-176, jacket2-6, pants1_52-176).
  // Scaling already-millimetre coordinates by 10 inflated those patterns 10× so
  // their geometry spanned ~10 m instead of ~1 m. That overflowed the 2D canvas
  // and made the CDT mesher (cdtMesher.ts) non-terminating, so the cloth never
  // produced a mesh. cm patterns (male_shirt etc.) were unaffected because ×10 is
  // correct for them — which is why the bug only showed up on certain patterns.
  //
  // Honour the declared unit instead. Unit-less patterns default to cm to
  // preserve the historical behaviour relied on by the synthetic fixtures in the
  // adapter tests. (This mirrors the unit-aware scale already used in
  // seamlyTools.ts: `patternData.unit === 'cm' ? 10 : 1`.)
  const unit = (pattern.unit ?? 'cm').toLowerCase();
  const TO_MM = unit === 'mm' ? 1 : (unit === 'inch' || unit === 'in') ? 25.4 : 10;
  for (const pt of cPoints) {
    pt.x *= TO_MM;
    pt.y *= TO_MM;
  }
  for (const curve of cCurves) {
    if (curve.resolvedCommands) {
      for (const cmd of curve.resolvedCommands) {
        if (cmd.values) {
          for (let i = 0; i < cmd.values.length; i++) {
            cmd.values[i] *= TO_MM;
          }
        }
      }
    }
    // Scale numeric values in curve definition
    const def = curve.definition;
    if (def.type === 'cubicBezier') {
      if (typeof def.cp1x === 'number') def.cp1x *= TO_MM;
      if (typeof def.cp1y === 'number') def.cp1y *= TO_MM;
      if (typeof def.cp2x === 'number') def.cp2x *= TO_MM;
      if (typeof def.cp2y === 'number') def.cp2y *= TO_MM;
    } else if (def.type === 'spline') {
      if (typeof def.length1 === 'number') def.length1 *= TO_MM;
      if (typeof def.length2 === 'number') def.length2 *= TO_MM;
    } else if (def.type === 'arc') {
      if (typeof def.radius === 'number') def.radius *= TO_MM;
    }
  }

  return {
    points: cPoints,
    curves: cCurves,
    pieces: cPieces,
    variables: resolvedVars,
    errors,
  };
}
