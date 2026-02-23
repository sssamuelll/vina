/**
 * Construction Resolver
 * 
 * Resolves all construction points to concrete (x, y) coordinates
 * given the current measurements and variables.
 * 
 * This is called whenever measurements change to update the parametric model.
 */

import type { CPoint, PointDefinition } from '../../types/construction';
import { evaluateFormula, type FormulaContext } from '../seamly2d/formulaEvaluator';

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveValue(val: string | number, ctx: FormulaContext): number {
  if (typeof val === 'number') return val;
  return evaluateFormula(val, ctx);
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

function angleOf(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax) * (180 / Math.PI);
}

function angleToOffset(angleDeg: number, len: number): { dx: number; dy: number } {
  const rad = degToRad(angleDeg);
  return { dx: len * Math.cos(rad), dy: -len * Math.sin(rad) };
}

function lineLineIntersect(
  p1x: number, p1y: number, p2x: number, p2y: number,
  p3x: number, p3y: number, p4x: number, p4y: number,
): { x: number; y: number } | null {
  const d1x = p2x - p1x, d1y = p2y - p1y;
  const d2x = p4x - p3x, d2y = p4y - p3y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((p3x - p1x) * d2y - (p3y - p1y) * d2x) / denom;
  return { x: p1x + t * d1x, y: p1y + t * d1y };
}

// ─── Main Resolver ──────────────────────────────────────────────────────────

export interface ResolveResult {
  resolved: Array<{ id: string; x: number; y: number }>;
  errors: Array<{ id: string; label: string; error: string }>;
}

/**
 * Resolve all construction points to concrete coordinates.
 * Points are resolved in order — later points can reference earlier ones.
 */
export function resolveConstructionPoints(
  points: CPoint[],
  measurements: Record<string, number>,
  variables: Record<string, string | number>,
): ResolveResult {
  const ctx: FormulaContext = { measurements, variables: {} };

  // First resolve variables
  for (const [name, val] of Object.entries(variables)) {
    ctx.variables[name] = typeof val === 'number' ? val : evaluateFormula(val, ctx);
  }

  const resolved: Array<{ id: string; x: number; y: number }> = [];
  const errors: Array<{ id: string; label: string; error: string }> = [];
  const pointMap = new Map<string, { x: number; y: number }>();

  // Lookup by ID or label
  function getPointByRef(ref: string): { x: number; y: number } | null {
    const byId = pointMap.get(ref);
    if (byId) return byId;
    // Search by label
    for (const pt of points) {
      if (pt.label === ref) {
        return pointMap.get(pt.id) ?? null;
      }
    }
    return null;
  }

  for (const point of points) {
    try {
      const pos = resolvePoint(point.definition, getPointByRef, ctx);
      pointMap.set(point.id, pos);
      resolved.push({ id: point.id, x: pos.x, y: pos.y });
    } catch (e) {
      errors.push({ id: point.id, label: point.label, error: (e as Error).message });
      // Place at 0,0 so downstream points can still try
      pointMap.set(point.id, { x: 0, y: 0 });
      resolved.push({ id: point.id, x: 0, y: 0 });
    }
  }

  return { resolved, errors };
}

function resolvePoint(
  def: PointDefinition,
  getPoint: (ref: string) => { x: number; y: number } | null,
  ctx: FormulaContext,
): { x: number; y: number } {
  switch (def.type) {
    case 'absolute': {
      return {
        x: resolveValue(def.x, ctx),
        y: resolveValue(def.y, ctx),
      };
    }

    case 'manual': {
      return { x: def.x, y: def.y };
    }

    case 'endLine': {
      const base = getPoint(def.basePoint);
      if (!base) throw new Error(`Base point "${def.basePoint}" not found`);
      const angle = resolveValue(def.angle, ctx);
      const length = resolveValue(def.length, ctx);
      const { dx, dy } = angleToOffset(angle, length);
      return { x: base.x + dx, y: base.y + dy };
    }

    case 'alongLine': {
      const from = getPoint(def.from);
      const to = getPoint(def.to);
      if (!from) throw new Error(`Point "${def.from}" not found`);
      if (!to) throw new Error(`Point "${def.to}" not found`);
      const totalDist = dist(from.x, from.y, to.x, to.y);
      const length = resolveValue(def.length, ctx);
      if (totalDist < 1e-10) return { ...from };
      const ratio = length / totalDist;
      return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      };
    }

    case 'normal': {
      const from = getPoint(def.from);
      const to = getPoint(def.to);
      if (!from) throw new Error(`Point "${def.from}" not found`);
      if (!to) throw new Error(`Point "${def.to}" not found`);
      const lineAngle = angleOf(from.x, from.y, to.x, to.y);
      const normalAngle = lineAngle + resolveValue(def.angle, ctx);
      const length = resolveValue(def.length, ctx);
      const { dx, dy } = angleToOffset(normalAngle, length);
      return { x: from.x + dx, y: from.y + dy };
    }

    case 'intersection': {
      const l1s = getPoint(def.line1Start);
      const l1e = getPoint(def.line1End);
      const l2s = getPoint(def.line2Start);
      const l2e = getPoint(def.line2End);
      if (!l1s || !l1e || !l2s || !l2e) throw new Error('Intersection: missing points');
      const result = lineLineIntersect(l1s.x, l1s.y, l1e.x, l1e.y, l2s.x, l2s.y, l2e.x, l2e.y);
      if (!result) throw new Error('Lines are parallel — no intersection');
      return result;
    }

    case 'intersectionXY': {
      const px = getPoint(def.xFrom);
      const py = getPoint(def.yFrom);
      if (!px || !py) throw new Error('IntersectionXY: missing points');
      return { x: px.x, y: py.y };
    }

    case 'midpoint': {
      const from = getPoint(def.from);
      const to = getPoint(def.to);
      if (!from || !to) throw new Error('Midpoint: missing points');
      return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    }

    default:
      throw new Error(`Unknown point type: ${(def as { type: string }).type}`);
  }
}
