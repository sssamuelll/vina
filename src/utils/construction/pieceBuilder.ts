/**
 * Piece Builder
 * 
 * Converts a CPiece (construction piece definition referencing named points and curves)
 * into a PatternPiece with concrete SVG PathCommands.
 */

import type { PatternPiece, PathCommand } from '../../types/types';
import type { CPoint, CCurve, CPiece } from '../../types/construction';
import { uid } from '../pathHelpers';
import { evaluateFormula, type FormulaContext } from '../seamly2d/formulaEvaluator';

function resolveValue(val: string | number, ctx: FormulaContext): number {
  if (typeof val === 'number') return val;
  return evaluateFormula(val, ctx);
}

export interface BuildPieceResult {
  piece: PatternPiece;
  normOffset: { x: number; y: number };
}

/**
 * Build a PatternPiece from a construction piece definition.
 *
 * @param cPiece - Construction piece definition
 * @param points - All resolved construction points
 * @param curves - All construction curves
 * @param ctx - Formula context with measurements and variables
 * @param existingPieceId - Optional existing piece ID for upsert behavior (preserves seams)
 */
export function buildPiece(
  cPiece: CPiece,
  points: CPoint[],
  curves: CCurve[],
  ctx: FormulaContext,
  existingPieceId?: string,
): PatternPiece {
  return buildPieceWithOffset(cPiece, points, curves, ctx, existingPieceId).piece;
}

/**
 * Build a PatternPiece and return the normalization offset for overlay alignment.
 *
 * @param cPiece - Construction piece definition
 * @param points - All resolved construction points
 * @param curves - All construction curves
 * @param ctx - Formula context with measurements and variables
 * @param existingPieceId - Optional existing piece ID for upsert behavior (preserves seams)
 */
export function buildPieceWithOffset(
  cPiece: CPiece,
  points: CPoint[],
  curves: CCurve[],
  ctx: FormulaContext,
  existingPieceId?: string,
): BuildPieceResult {
  const pointMap = new Map(points.map(p => [p.id, p]));
  const curveMap = new Map(curves.map(c => [c.id, c]));

  // Also index by label for convenience
  for (const p of points) pointMap.set(p.label, p);
  for (const c of curves) curveMap.set(c.label, c);

  const outline: PathCommand[] = [];

  for (let i = 0; i < cPiece.nodes.length; i++) {
    const node = cPiece.nodes[i];
    const point = pointMap.get(node.pointId);
    if (!point) continue;

    if (i === 0) {
      outline.push({ type: 'M', values: [point.x, point.y] });
    }

    // Connection to next node
    const nextNode = cPiece.nodes[(i + 1) % cPiece.nodes.length];
    if (!nextNode) continue;
    const nextPoint = pointMap.get(nextNode.pointId);
    if (!nextPoint) continue;

    if (node.connection === 'curve' && node.curveId) {
      const curve = curveMap.get(node.curveId);
      if (curve?.resolvedCommands && curve.resolvedCommands.length > 0) {
        // Use pre-resolved multi-segment commands (e.g. splinePath)
        // Skip the initial M command since we're already positioned
        // Clone each command — originals may be frozen by Immer/Redux
        if (node.reverse) {
          // Reverse multi-segment path: reverse order, swap control points, fix endpoints
          const cCmds = curve.resolvedCommands.filter(c => c.type === 'C');
          // Collect the chain of endpoints: M start, then each C endpoint
          const mCmd = curve.resolvedCommands.find(c => c.type === 'M');
          const chainPts: Array<{x: number; y: number}> = [];
          if (mCmd) chainPts.push({ x: mCmd.values[0], y: mCmd.values[1] });
          for (const c of cCmds) chainPts.push({ x: c.values[4], y: c.values[5] });
          // Walk reversed: for segment i (0-indexed), reversed segment uses:
          //   cp1 = original cp2, cp2 = original cp1, endpoint = previous chain point
          for (let i = cCmds.length - 1; i >= 0; i--) {
            const orig = cCmds[i].values;
            const endPt = chainPts[i]; // previous point in original chain = new endpoint
            outline.push({
              type: 'C',
              values: [orig[2], orig[3], orig[0], orig[1], endPt.x, endPt.y],
            });
          }
        } else {
          for (const cmd of curve.resolvedCommands) {
            if (cmd.type === 'M') continue;
            outline.push({ type: cmd.type, values: [...cmd.values] });
          }
        }
      } else if (curve) {
        const cmds = resolveCurve(curve, point, nextPoint, ctx, node.reverse);
        outline.push(...cmds);
      } else {
        outline.push({ type: 'L', values: [nextPoint.x, nextPoint.y] });
      }
    } else {
      outline.push({ type: 'L', values: [nextPoint.x, nextPoint.y] });
    }
  }

  if (cPiece.closed && outline.length > 0) {
    outline.push({ type: 'Z', values: [] });
  }

  // Normalize: shift so bounding box starts near origin
  const allX = outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0));
  const allY = outline.flatMap(c => c.values.filter((_, i) => i % 2 === 1));
  const minX = allX.length > 0 ? Math.min(...allX) : 0;
  const minY = allY.length > 0 ? Math.min(...allY) : 0;

  if (minX !== 0 || minY !== 0) {
    for (const cmd of outline) {
      for (let i = 0; i < cmd.values.length; i += 2) {
        cmd.values[i] -= minX;
        if (i + 1 < cmd.values.length) cmd.values[i + 1] -= minY;
      }
    }
  }

  const now = Date.now();

  return {
    piece: {
      // Use existing ID if provided (upsert behavior), otherwise generate new
      id: existingPieceId || uid(),
      name: cPiece.name,
      outline,
      internals: [],
      position: { x: 50, y: 50 },
      rotation: 0,
      mirrored: false,
      seamAllowance: cPiece.seamAllowance,
      constructionPieceId: cPiece.id,
      // Preserve createdAt for existing pieces, set new for new pieces
      createdAt: existingPieceId ? now : now, // TODO: fetch original createdAt from store
      updatedAt: now,
    },
    normOffset: { x: minX, y: minY },
  };
}

function resolveCurve(
  curve: CCurve,
  from: CPoint,
  to: CPoint,
  ctx: FormulaContext,
  reverse?: boolean,
): PathCommand[] {
  const def = curve.definition;

  if (def.type === 'spline') {
    const a1 = resolveValue(def.angle1, ctx);
    const a2 = resolveValue(def.angle2, ctx);
    const l1 = resolveValue(def.length1, ctx);
    const l2 = resolveValue(def.length2, ctx);
    const rad1 = (a1 * Math.PI) / 180;
    // Seamly2D GetP3: p4p3.setAngle(angle2) — angle2 points directly from p4 toward cp2
    const rad2 = (a2 * Math.PI) / 180;
    const cp1x = from.x + l1 * Math.cos(rad1);
    const cp1y = from.y - l1 * Math.sin(rad1);
    const cp2x = to.x + l2 * Math.cos(rad2);
    const cp2y = to.y - l2 * Math.sin(rad2);

    if (reverse) {
      return [{ type: 'C', values: [cp2x, cp2y, cp1x, cp1y, from.x, from.y] }];
    }
    return [{ type: 'C', values: [cp1x, cp1y, cp2x, cp2y, to.x, to.y] }];
  }

  if (def.type === 'cubicBezier') {
    const cp1x = resolveValue(def.cp1x, ctx);
    const cp1y = resolveValue(def.cp1y, ctx);
    const cp2x = resolveValue(def.cp2x, ctx);
    const cp2y = resolveValue(def.cp2y, ctx);

    if (reverse) {
      return [{ type: 'C', values: [cp2x, cp2y, cp1x, cp1y, from.x, from.y] }];
    }
    return [{ type: 'C', values: [cp1x, cp1y, cp2x, cp2y, to.x, to.y] }];
  }

  // arc — approximate with cubic bezier
  if (def.type === 'arc') {
    // Simple fallback: straight line
    return [{ type: 'L', values: [reverse ? from.x : to.x, reverse ? from.y : to.y] }];
  }

  return [{ type: 'L', values: [to.x, to.y] }];
}
