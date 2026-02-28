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
