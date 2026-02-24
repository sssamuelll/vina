/**
 * Seamly2D → Construction Engine Adapter
 *
 * Converts resolved Seamly2D pattern data (from constructionResolver)
 * into the Redux construction format (CPoint[], CCurve[], CPiece[]).
 *
 * This bridges the gap between the 42 real Seamly2D patterns and
 * our construction engine + piece builder pipeline.
 */

import type { CPoint, CCurve, CPiece, PieceNode, CurveDefinition } from '../../types/construction';
import { resolveConstruction, type ConstructionStep } from './constructionResolver';
import { evaluateFormula, type FormulaContext } from './formulaEvaluator';

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

let _counter = 0;
function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
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
  const { points: resolvedPoints } = resolveConstruction(
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

  // 5. Convert splines/splinePaths → CCurve[]
  const cCurves: CCurve[] = [];
  const curveIdMap = new Map<number, string>(); // seamly step id → our CCurve id

  for (const step of pattern.construction) {
    if (step.type === 'spline' && step.point1 != null && step.point4 != null) {
      const fromId = pointIdMap.get(step.point1);
      const toId = pointIdMap.get(step.point4);
      if (!fromId || !toId) continue;

      const fromPt = cPoints.find(p => p.id === fromId);
      const toPt = cPoints.find(p => p.id === toId);
      if (!fromPt || !toPt) continue;

      const cvId = uid('sc');
      curveIdMap.set(step.id, cvId);

      // Store as resolved cubicBezier (already computed by constructionResolver)
      // But we need the control points — reconstruct from angles
      const a1 = typeof step.angle1 === 'number' ? step.angle1 : 0;
      const a2 = typeof step.angle2 === 'number' ? step.angle2 : 0;
      const dist = Math.sqrt((toPt.x - fromPt.x) ** 2 + (toPt.y - fromPt.y) ** 2);
      const l1 = typeof step.length1 === 'number' ? step.length1 : dist / 3;
      const l2 = typeof step.length2 === 'number' ? step.length2 : dist / 3;

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

    if (step.type === 'splinePath' && step.nodes && step.nodes.length >= 2) {
      // A splinePath is a multi-segment spline — we split into individual curves
      const cvId = uid('sc');
      curveIdMap.set(step.id, cvId);

      // For piece building, we store the full path as a sequence of curves
      // We'll use the first/last point as from/to
      const firstNode = step.nodes[0];
      const lastNode = step.nodes[step.nodes.length - 1];
      const fromId = pointIdMap.get(firstNode.point);
      const toId = pointIdMap.get(lastNode.point);

      if (fromId && toId) {
        const fromPt = cPoints.find(p => p.id === fromId);
        const toPt = cPoints.find(p => p.id === toId);

        if (fromPt && toPt) {
          // Store as cubicBezier with computed control points
          // For multi-segment paths, we approximate with a single bezier
          // (the piece builder will use this for the outline)
          const a1 = typeof firstNode.angle2 === 'number' ? firstNode.angle2 :
                     typeof firstNode.angle1 === 'number' ? firstNode.angle1 : 0;
          const a2 = typeof lastNode.angle1 === 'number' ? lastNode.angle1 :
                     typeof lastNode.angle2 === 'number' ? lastNode.angle2 : 0;
          const dist = Math.sqrt((toPt.x - fromPt.x) ** 2 + (toPt.y - fromPt.y) ** 2);
          const l1 = typeof firstNode.length2 === 'number' ? firstNode.length2 : dist / 3;
          const l2 = typeof lastNode.length1 === 'number' ? lastNode.length1 : dist / 3;

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
        const point = cPoints.find(p => p.id === pointCId);
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

  return {
    points: cPoints,
    curves: cCurves,
    pieces: cPieces,
    variables: resolvedVars,
    errors,
  };
}
