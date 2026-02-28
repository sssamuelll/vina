/**
 * Vision Layer Types — Core interfaces for Copilot intelligence.
 *
 * Organized by layer:
 * - Perception: SemanticLandmark, GeometricFingerprint, SpatialRelationship
 * - Memory: DesignLogEntry, SkillOverride
 * - Action: IntentPrediction, AuditResult
 *
 * @module copilot/vision/types
 */

// ─── Perception Layer: Segment Analysis ─────────────────────────────────────

/**
 * Edge segment classification based on curvature.
 */
export type SegmentType = 'straight' | 'convex' | 'concave';

/**
 * A recognized anatomical landmark on a pattern piece edge.
 */
export interface SemanticLandmark {
  /** Index of the edge in the piece outline */
  edgeIndex: number;
  /** Anatomical label (neckline, armhole, hemline, etc.) */
  label: LandmarkLabel;
  /** Recognition confidence (0-1) */
  confidence: number;
  /** Curvature type of this edge segment */
  curvatureType: SegmentType;
}

/**
 * Known anatomical landmark labels.
 */
export type LandmarkLabel =
  | 'neckline'
  | 'armhole'
  | 'shoulder'
  | 'side_seam'
  | 'hemline'
  | 'center_front'
  | 'center_back'
  | 'waistline'
  | 'hipline'
  | 'sleeve_cap'
  | 'cuff'
  | 'collar'
  | 'unknown';

/**
 * Geometric fingerprint of a pattern piece for template matching.
 */
export interface GeometricFingerprint {
  /** Piece ID this fingerprint belongs to */
  pieceId: string;
  /** Ordered list of segment types around the outline */
  segmentTypes: SegmentType[];
  /** Named length ratios (e.g., shoulder/side = 0.35) */
  ratios: Record<string, number>;
  /** Fraction of outline that is curved (0-1) */
  curvatureDensity: number;
  /** Detected anatomical landmarks */
  landmarks: SemanticLandmark[];
}

// ─── Perception Layer: Spatial Analysis ─────────────────────────────────────

/**
 * Types of spatial relationships between pieces.
 */
export type SpatialRelationType =
  | 'adjacent'      // Close in 3D, potentially sewable
  | 'overlapping'   // Pieces intersect in 3D
  | 'distant'       // Too far to interact
  | 'sewn';         // Connected by a seam

/**
 * A spatial relationship between two pieces in 3D space.
 */
export interface SpatialRelationship {
  /** First piece ID */
  pieceAId: string;
  /** Second piece ID */
  pieceBId: string;
  /** Relationship type */
  type: SpatialRelationType;
  /** Minimum distance between boundaries in mm */
  distance3D: number;
  /** Index of closest edge on piece A */
  edgeAIndex?: number;
  /** Index of closest edge on piece B */
  edgeBIndex?: number;
  /** Whether these pieces have a sewing connection */
  hasSewingConnection: boolean;
}

/**
 * Severity levels for spatial conflicts.
 */
export type ConflictSeverity = 'low' | 'high';

/**
 * Types of spatial conflicts.
 */
export type ConflictType = 'gap' | 'overlap' | 'collision' | 'instability';

/**
 * A detected spatial conflict requiring attention.
 */
export interface SpatialConflict {
  /** Type of conflict */
  type: ConflictType;
  /** How serious the conflict is */
  severity: ConflictSeverity;
  /** IDs of affected pieces */
  affectedPieceIds: string[];
  /** Human-readable description */
  description: string;
}

// ─── Memory Layer: Design Log ───────────────────────────────────────────────

/**
 * Types of design log entries.
 */
export type DesignLogEntryType =
  | 'decision'    // A design choice made
  | 'constraint'  // A rule that must be preserved
  | 'note'        // A general observation
  | 'warning';    // A potential issue flagged

/**
 * A single entry in the durable design log.
 */
export interface DesignLogEntry {
  /** Unique entry ID */
  id: string;
  /** When this entry was created */
  timestamp: number;
  /** Entry type */
  type: DesignLogEntryType;
  /** Human-readable summary */
  summary: string;
  /** IDs of pieces this entry relates to */
  relatedPieceIds: string[];
  /** Additional structured data */
  metadata?: Record<string, unknown>;
}

/**
 * A user-defined override for a skill formula.
 */
export interface SkillOverride {
  /** Unique override ID */
  id: string;
  /** Skill this override applies to (e.g., 'core:bodice') */
  skillId: string;
  /** Name of the formula being overridden */
  formulaName: string;
  /** Original formula expression */
  originalValue: string;
  /** User's preferred expression */
  overrideValue: string;
  /** Why the override was created */
  reason: string;
  /** When the override was created */
  createdAt: number;
}

/**
 * The complete design log for a project.
 */
export interface DesignLog {
  /** Project this log belongs to */
  projectId: string;
  /** Log entries */
  entries: DesignLogEntry[];
  /** User formula overrides */
  overrides: SkillOverride[];
  /** Last time the log was flushed to storage */
  lastFlushAt: number;
}

// ─── Action Layer: Intent Prediction ────────────────────────────────────────

/**
 * Types of geometric audit rules.
 */
export type AuditRuleType =
  | 'area_integrity'      // Area > 0
  | 'self_intersection'   // No self-crossing
  | 'seam_compatibility'  // Sewn edges still match
  | 'constraint_violation'; // Violates a design log constraint

/**
 * Result of a single audit rule check.
 */
export interface AuditResult {
  /** Which rule was checked */
  rule: AuditRuleType;
  /** Whether the check passed */
  passed: boolean;
  /** Error message if failed */
  message?: string;
}

/**
 * Pre-flight prediction of a tool call's effect.
 */
export interface IntentPrediction {
  /** Name of the tool being called */
  toolName: string;
  /** ID of the piece being modified */
  originalPieceId: string;
  /** Predicted changes to piece properties */
  predictedChanges: Record<string, unknown>;
  /** Whether the change is safe to apply */
  isSafe: boolean;
  /** Results of all audit rule checks */
  auditResults: AuditResult[];
  /** Suggested alternative if unsafe */
  suggestedFix?: string;
}

// ─── Perception Layer: Template Matching ────────────────────────────────────

/**
 * A match against a known garment archetype.
 */
export interface ArchetypeMatch {
  /** ID of the matched archetype (e.g., 'bodice_front') */
  archetypeId: string;
  /** Human-readable archetype name */
  archetypeName: string;
  /** Similarity score (0-1) */
  similarity: number;
  /** Which landmarks matched */
  matchedLandmarks: LandmarkLabel[];
}

/**
 * Complete semantic analysis of a pattern piece.
 */
export interface PieceSemantics {
  /** Piece ID */
  pieceId: string;
  /** Geometric fingerprint */
  fingerprint: GeometricFingerprint;
  /** Best archetype match (if any) */
  bestMatch?: ArchetypeMatch;
  /** Nearest avatar bone (for proximity anchor) */
  avatarProximity?: string;
}

// ─── Context Integration ────────────────────────────────────────────────────

/**
 * Complete cerebral context for a single LLM request.
 */
export interface CerebralContext {
  /** Semantic analysis of all pieces */
  pieceSemantics: PieceSemantics[];
  /** Spatial relationships between pieces */
  spatialRelationships: SpatialRelationship[];
  /** Active spatial conflicts */
  conflicts: SpatialConflict[];
  /** Recent design decisions */
  recentDecisions: DesignLogEntry[];
  /** Active formula overrides */
  activeOverrides: SkillOverride[];
}
