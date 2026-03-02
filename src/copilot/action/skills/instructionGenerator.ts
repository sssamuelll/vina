/**
 * Instruction Generator — converts Seamly2D geometric steps to natural language.
 *
 * Transforms low-level construction steps (points, lines, curves) into
 * human-readable instructions that the Copilot can understand and explain
 * to users.
 *
 * @module skills/instructionGenerator
 */
import type { SeamlyConstructionStep } from './seamlyParser';

// ─── Instruction Templates ───────────────────────────────────────────────────

type StepTemplate = (step: SeamlyConstructionStep) => string;

const STEP_TEMPLATES: Record<string, StepTemplate> = {
  // Basic points
  single: (s) => `Mark point ${s.name} at coordinates (${s.x}, ${s.y})`,

  endLine: (s) =>
    `From point ${s.basePoint}, draw a line at ${s.angle}° with length ${s.length} to create point ${s.name}`,

  alongLine: (s) =>
    `Along the line from ${s.firstPoint} to ${s.secondPoint}, measure ${s.length} to mark point ${s.name}`,

  normal: (s) =>
    `From point ${s.firstPoint}, draw a perpendicular (${s.angle}°) line of length ${s.length} to create point ${s.name}`,

  // Intersection points
  pointOfIntersection: (s) =>
    `Find the intersection point ${s.name} between horizontal from ${s.firstPoint} and vertical from ${s.secondPoint}`,

  lineIntersectAxis: (s) =>
    `From point ${s.basePoint} at angle ${s.angle}°, find intersection with line ${s.p1Line}-${s.p2Line} to create point ${s.name}`,

  lineIntersect: (s) =>
    `Find intersection of line ${s.p1Line1}-${s.p2Line1} and line ${s.p1Line2}-${s.p2Line2} to create point ${s.name}`,

  curveIntersectAxis: (s) =>
    `From point ${s.basePoint} at angle ${s.angle}°, find intersection with curve ${s.curve} to create point ${s.name}`,

  intersectXY: (s) =>
    `Find point ${s.name} at the X coordinate of ${s.firstPoint} and Y coordinate of ${s.secondPoint}`,

  // Special construction points
  bisector: (s) =>
    `Draw the angle bisector from ${s.firstPoint}-${s.secondPoint}-${s.thirdPoint} with length ${s.length} to create point ${s.name}`,

  shoulder: (s) =>
    `From shoulder point ${s.pShoulder}, measure ${s.length} along line ${s.p1Line}-${s.p2Line} to create point ${s.name}`,

  height: (s) =>
    `Drop a perpendicular from ${s.basePoint} to line ${s.p1Line}-${s.p2Line} to create point ${s.name}`,

  triangle: (s) =>
    `Construct triangle point ${s.name} using axis ${s.axisP1}-${s.axisP2} and points ${s.firstPoint}, ${s.secondPoint}`,

  // Circle/arc intersection points
  pointOfContact: (s) =>
    `Find tangent point ${s.name} on circle centered at ${s.center} with radius ${s.radius} from line ${s.firstPoint}-${s.secondPoint}`,

  pointOfIntersectionCircles: (s) =>
    `Find intersection ${s.name} of circles centered at ${s.c1Center} (r=${s.c1Radius}) and ${s.c2Center} (r=${s.c2Radius})`,

  pointOfIntersectionArcs: (s) =>
    `Find intersection ${s.name} of arcs ${s.firstArc} and ${s.secondArc}`,

  pointFromCircleAndTangent: (s) =>
    `Find tangent point ${s.name} from ${s.tangent} to circle at ${s.center} with radius ${s.radius}`,

  pointFromArcAndTangent: (s) =>
    `Find tangent point ${s.name} from ${s.tangent} to arc ${s.arc}`,

  // Curve cut points
  cutSpline: (s) => `Along spline ${s.spline}, measure ${s.length} to create point ${s.name}`,

  cutSplinePath: (s) => `Along spline path ${s.splinePath}, measure ${s.length} to create point ${s.name}`,

  cutArc: (s) => `Along arc ${s.arc}, measure ${s.length} to create point ${s.name}`,

  // Dart construction
  trueDarts: (s) =>
    `Construct true dart point ${s.name} using dart points ${s.d1}, ${s.d2}, ${s.d3} on line ${s.p1Line}-${s.p2Line}`,

  // Curves
  spline: (s) =>
    `Draw a curve from point ${s.point1} to point ${s.point4} with angles ${s.angle1}° and ${s.angle2}°`,

  splinePath: () => `Draw a multi-segment curve path through the specified control points`,

  cubicBezier: (s) =>
    `Draw a cubic bezier curve from ${s.point1} through control points ${s.point2}, ${s.point3} to ${s.point4}`,

  cubicBezierPath: () => `Draw a cubic bezier path through the specified points`,

  // Lines
  line: (s) => `Draw a construction line from point ${s.firstPoint} to point ${s.secondPoint}`,

  // Arcs
  arc_simple: (s) =>
    `Draw an arc centered at ${s.center} with radius ${s.radius} from ${s.angle1}° to ${s.angle2}°`,

  arc_arcWithLength: (s) =>
    `Draw an arc centered at ${s.center} with radius ${s.radius} starting at ${s.angle1}° with arc length ${s.length}`,

  // Operations/transformations
  op_rotation: (s) => `Rotate element ${s.sourceId ?? 'source'} around point ${s.center} by ${s.angle}°`,

  op_flippingByLine: (s) => `Mirror element ${s.sourceId ?? 'source'} across line ${s.p1Line}-${s.p2Line}`,

  op_flippingByAxis: (s) =>
    `Mirror element ${s.sourceId ?? 'source'} across ${s.axisType} axis at point ${s.center}`,

  op_moving: (s) =>
    `Move element ${s.sourceId ?? 'source'} at angle ${s.angle}° by distance ${s.length}`,
};

// ─── Tool Call Mappings ──────────────────────────────────────────────────────

const STEP_TOOLS: Record<string, string[]> = {
  // Points → createPoint
  single: ['createPoint'],
  endLine: ['createPoint'],
  alongLine: ['createPoint'],
  normal: ['createPoint'],
  pointOfIntersection: ['createPoint'],
  lineIntersectAxis: ['createPoint'],
  lineIntersect: ['createPoint'],
  curveIntersectAxis: ['createPoint'],
  intersectXY: ['createPoint'],
  bisector: ['createPoint'],
  shoulder: ['createPoint'],
  height: ['createPoint'],
  triangle: ['createPoint'],
  pointOfContact: ['createPoint'],
  pointOfIntersectionCircles: ['createPoint'],
  pointOfIntersectionArcs: ['createPoint'],
  pointFromCircleAndTangent: ['createPoint'],
  pointFromArcAndTangent: ['createPoint'],
  cutSpline: ['createPoint'],
  cutSplinePath: ['createPoint'],
  cutArc: ['createPoint'],
  trueDarts: ['createPoint'],

  // Curves → createCurve
  spline: ['createCurve'],
  splinePath: ['createCurve'],
  cubicBezier: ['createCurve'],
  cubicBezierPath: ['createCurve'],

  // Lines → createLine
  line: ['createLine'],

  // Arcs → createArc
  arc_simple: ['createArc'],
  arc_arcWithLength: ['createArc'],

  // Operations → transformPiece
  op_rotation: ['transformPiece'],
  op_flippingByLine: ['transformPiece'],
  op_flippingByAxis: ['transformPiece'],
  op_moving: ['transformPiece'],
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a natural language instruction for a construction step.
 *
 * @param step - The Seamly2D construction step
 * @returns Human-readable instruction string
 */
export function generateInstruction(step: SeamlyConstructionStep): string {
  const template = STEP_TEMPLATES[step.type];
  if (template) {
    return template(step);
  }
  return `Execute ${step.type} operation for ${step.name || `element ${step.id}`}`;
}

/**
 * Get the Copilot tool calls for a construction step type.
 *
 * @param stepType - The step type string
 * @returns Array of tool names to call
 */
export function getToolCalls(stepType: string): string[] {
  return STEP_TOOLS[stepType] ?? [];
}
