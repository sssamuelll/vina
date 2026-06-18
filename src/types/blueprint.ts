/**
 * Construction Blueprint Types
 * 
 * Architecture:
 *   Blueprint → Block[] → Step[]
 * 
 * A Blueprint is a complete garment plan (e.g., "Basic T-shirt").
 * It contains one or more Blocks (e.g., Front Body, Back Body, Sleeve).
 * Each Block uses a Method (e.g., Aldrich, Müller) and has ordered construction steps.
 * 
 * DORMANT (M2, #847): the blueprint executor was removed; nothing runs these
 * blocks today. These types are retained as the schema substrate for blueprint
 * authoring (#53, post-M2). The slice + tools are not wired to the live agent.
 */

// ─── Step Types ─────────────────────────────────────────────────────────────

export interface StepBase {
  /** Optional comment explaining this step (shown to patronista) */
  comment?: string;
  /** Optional comment in Spanish */
  commentEs?: string;
}

export interface PointStep extends StepBase {
  tool: 'addConstructionPoint';
  label: string;
  type: 'absolute' | 'endLine' | 'alongLine' | 'normal' | 'midpoint' | 'intersectionXY';
  x?: string | number;
  y?: string | number;
  basePoint?: string;
  angle?: string | number;
  length?: string | number;
  from?: string;
  to?: string;
  xFrom?: string;
  yFrom?: string;
}

export interface LineStep extends StepBase {
  tool: 'addConstructionLine';
  label: string;
  from: string;
  to: string;
  style?: 'solid' | 'dashed' | 'construction';
}

export interface CurveStep extends StepBase {
  tool: 'addConstructionCurve';
  label: string;
  from: string;
  to: string;
  angle1: string | number;
  angle2: string | number;
  length1: string | number;
  length2: string | number;
}

export interface BuildPieceStep extends StepBase {
  tool: 'buildPieceFromConstruction';
  name: string;
  /** Ordered point labels forming the outline */
  points: string[];
  /** Curve labels between consecutive points. null = straight line */
  curves?: (string | null)[];
  seamAllowance?: number;
}

export type BlueprintStep = PointStep | LineStep | CurveStep | BuildPieceStep;

// ─── Block ──────────────────────────────────────────────────────────────────

/** A Block is a single pattern piece construction (e.g., "Front Bodice Block") */
export interface Block {
  /** Unique ID within the blueprint */
  id: string;
  /** Human-readable name */
  name: string;
  nameEs?: string;
  /** Construction method used (e.g., "Aldrich", "Müller") */
  method: string;
  /** Block type */
  type: 'body' | 'sleeve' | 'collar' | 'cuff' | 'waistband' | 'pocket' | 'hood' | 'other';
  /** Variables specific to this block (merged with blueprint-level variables) */
  variables?: Record<string, {
    label: string;
    labelEs?: string;
    default: string | number;
    description?: string;
  }>;
  /** Ordered construction steps */
  steps: BlueprintStep[];
}

// ─── Blueprint ──────────────────────────────────────────────────────────────

/** A Blueprint is a complete garment plan containing one or more Blocks */
export interface Blueprint {
  /** Unique ID */
  id: string;
  /** Human-readable name */
  name: string;
  nameEs?: string;
  /** Description of what this blueprint produces */
  description: string;
  descriptionEs?: string;
  /** Garment category */
  category: 'tops' | 'bottoms' | 'dresses' | 'outerwear' | 'underwear' | 'accessories' | 'blocks' | 'other';
  /** Required measurements (keys from BodyMeasurements) */
  requiredMeasurements: string[];
  /** Blueprint-level variables (shared across all blocks) */
  variables?: Record<string, {
    label: string;
    labelEs?: string;
    default: string | number;
    description?: string;
  }>;
  /** Ordered blocks to construct */
  blocks: Block[];
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

// ─── Library State ──────────────────────────────────────────────────────────

export interface BlueprintLibraryState {
  /** All available user blueprints (dormant — no executor in M2, see #847) */
  blueprints: Blueprint[];
}
