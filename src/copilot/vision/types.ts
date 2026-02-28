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
