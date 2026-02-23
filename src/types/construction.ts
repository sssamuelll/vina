/**
 * Construction Engine Types
 * 
 * The construction engine represents a parametric pattern as a sequence of
 * named geometric entities (points, lines, curves, arcs) that can be resolved
 * from measurements and formulas.
 * 
 * This is the foundation for:
 * - Step-by-step pattern building (human or AI)
 * - Seamly2D pattern import with full construction
 * - Parametric editing (change a measurement → pattern updates)
 * - Grading (same construction, different size tables)
 */

// ─── Primitives ─────────────────────────────────────────────────────────────

export interface CPoint {
  /** Unique ID */
  id: string;
  /** Human-readable label (e.g., "A", "neckPoint", "bustApex") */
  label: string;
  /** Resolved x coordinate (mm) */
  x: number;
  /** Resolved y coordinate (mm) */
  y: number;
  /** How this point was defined */
  definition: PointDefinition;
  /** Visual: whether to show label on canvas */
  visible: boolean;
}

export type PointDefinition =
  | { type: 'absolute'; x: string | number; y: string | number }
  | { type: 'endLine'; basePoint: string; angle: string | number; length: string | number }
  | { type: 'alongLine'; from: string; to: string; length: string | number }
  | { type: 'normal'; from: string; to: string; angle: string | number; length: string | number }
  | { type: 'intersection'; line1Start: string; line1End: string; line2Start: string; line2End: string }
  | { type: 'intersectionXY'; xFrom: string; yFrom: string }
  | { type: 'midpoint'; from: string; to: string }
  | { type: 'manual'; x: number; y: number };

export interface CLine {
  /** Unique ID */
  id: string;
  /** Human-readable label */
  label: string;
  /** Start point ID */
  from: string;
  /** End point ID */
  to: string;
  /** Line style for rendering */
  style: 'solid' | 'dashed' | 'construction';
  /** Visual */
  visible: boolean;
}

export interface CCurve {
  /** Unique ID */
  id: string;
  /** Human-readable label */
  label: string;
  /** Type of curve */
  definition: CurveDefinition;
  /** Visual */
  visible: boolean;
}

export type CurveDefinition =
  | { type: 'cubicBezier'; from: string; cp1x: string | number; cp1y: string | number; cp2x: string | number; cp2y: string | number; to: string }
  | { type: 'spline'; from: string; to: string; angle1: string | number; angle2: string | number; length1: string | number; length2: string | number }
  | { type: 'arc'; center: string; radius: string | number; startAngle: string | number; endAngle: string | number };

// ─── Piece Definition ───────────────────────────────────────────────────────

/** A node in a piece outline — references a point, with optional curve to next node */
export interface PieceNode {
  /** Point ID */
  pointId: string;
  /** How to connect to the NEXT node. 'line' = straight, 'curve' = use curveId */
  connection: 'line' | 'curve';
  /** Curve ID if connection is 'curve' */
  curveId?: string;
  /** Whether to reverse the curve direction */
  reverse?: boolean;
}

export interface CPiece {
  /** Unique ID */
  id: string;
  /** Human-readable name (e.g., "Front Bodice", "Delantero Corpiño") */
  name: string;
  /** Ordered list of nodes forming the outline */
  nodes: PieceNode[];
  /** Seam allowance in mm */
  seamAllowance: number;
  /** Whether this piece is complete (closed outline) */
  closed: boolean;
}

// ─── Construction State ─────────────────────────────────────────────────────

export interface ConstructionState {
  /** All construction points */
  points: CPoint[];
  /** All construction lines */
  lines: CLine[];
  /** All construction curves */
  curves: CCurve[];
  /** Piece definitions (outlines built from construction geometry) */
  pieces: CPiece[];
  /** Named variables/formulas for parametric control */
  variables: Record<string, string | number>;
  /** Currently selected entity for editing */
  selectedEntity: { type: 'point' | 'line' | 'curve' | 'piece'; id: string } | null;
  /** Whether construction overlay is visible */
  showConstruction: boolean;
}
