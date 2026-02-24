/**
 * Construction Blueprint Types
 * 
 * A blueprint is a reusable, step-by-step blueprint for constructing a garment piece.
 * Blueprints can come from:
 * - Built-in library (Seamly2D imports, standard methods)
 * - User-created (patronista records their own method)
 * - Community-shared (future)
 * 
 * The LLM does NOT invent construction steps. It finds the right blueprint
 * and executes it with the user's measurements. The patronista can edit
 * any blueprint or create new ones from scratch.
 */

// ─── Blueprint Step Types ──────────────────────────────────────────────────────

export interface BlueprintStepBase {
  /** Optional comment explaining this step (shown to patronista) */
  comment?: string;
  /** Optional comment in Spanish */
  commentEs?: string;
}

export interface PointStep extends BlueprintStepBase {
  tool: 'addConstructionPoint';
  label: string;
  type: 'absolute' | 'endLine' | 'alongLine' | 'normal' | 'midpoint' | 'intersectionXY';
  /** For absolute: x coordinate. Can be number or formula string (e.g., "chest/4+10") */
  x?: string | number;
  /** For absolute: y coordinate */
  y?: string | number;
  /** For endLine: base point label */
  basePoint?: string;
  /** For endLine/normal: angle in degrees */
  angle?: string | number;
  /** For endLine/alongLine/normal: distance. Formula string or number (mm) */
  length?: string | number;
  /** For alongLine/normal/midpoint: start point */
  from?: string;
  /** For alongLine/normal/midpoint: end point */
  to?: string;
  /** For intersectionXY */
  xFrom?: string;
  yFrom?: string;
}

export interface LineStep extends BlueprintStepBase {
  tool: 'addConstructionLine';
  label: string;
  from: string;
  to: string;
  style?: 'solid' | 'dashed' | 'construction';
}

export interface CurveStep extends BlueprintStepBase {
  tool: 'addConstructionCurve';
  label: string;
  from: string;
  to: string;
  angle1: string | number;
  angle2: string | number;
  length1: string | number;
  length2: string | number;
}

export interface BuildPieceStep extends BlueprintStepBase {
  tool: 'buildPieceFromConstruction';
  name: string;
  /** Ordered point labels forming the outline */
  points: string[];
  /** Curve labels between consecutive points. null = straight line */
  curves?: (string | null)[];
  seamAllowance?: number;
}

export type BlueprintStep = PointStep | LineStep | CurveStep | BuildPieceStep;

// ─── Blueprint ─────────────────────────────────────────────────────────────────

export interface Blueprint {
  /** Unique ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Localized name */
  nameEs?: string;
  /** Description of what this blueprint produces */
  description: string;
  descriptionEs?: string;
  /** Category */
  category: 'tops' | 'bottoms' | 'dresses' | 'outerwear' | 'underwear' | 'sleeves' | 'collars' | 'blocks' | 'other';
  /** Source method (e.g., "Aldrich", "Müller", "Custom", "Seamly2D") */
  method: string;
  /** Required measurements (keys from BodyMeasurements) */
  requiredMeasurements: string[];
  /** Optional variables with default values or formulas */
  variables?: Record<string, { 
    label: string; 
    labelEs?: string;
    default: string | number; 
    description?: string;
  }>;
  /** Ordered construction steps */
  steps: BlueprintStep[];
  /** Who created this blueprint */
  source: 'builtin' | 'user' | 'community';
  /** Tags for search */
  tags: string[];
  /** Version for future compatibility */
  version: number;
  /** Timestamps */
  createdAt: number;
  updatedAt: number;
}

// ─── Blueprint Library State ───────────────────────────────────────────────────

export interface BlueprintLibraryState {
  /** All available blueprints */
  blueprints: Blueprint[];
  /** Currently executing blueprint (null if none) */
  activeBlueprintId: string | null;
  /** Current step index in active blueprint execution */
  activeStepIndex: number;
  /** Whether execution is paused (patronista reviewing) */
  paused: boolean;
}
