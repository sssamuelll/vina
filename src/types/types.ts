// ─── Geometry Primitives ───

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

// ─── Pattern Pieces (2D) ───

export type PathCommandType = 'M' | 'L' | 'H' | 'V' | 'C' | 'S' | 'Q' | 'T' | 'A' | 'Z';

export interface PathCommand {
  type: PathCommandType;
  values: number[];
}

/** A single pattern piece — front bodice, back panel, sleeve, etc. */
export interface PatternPiece {
  id: string;
  name: string;
  /** Outline path (closed shape) */
  outline: PathCommand[];
  /** Internal lines: darts, grainline, notches */
  internals: InternalLine[];
  /** Position on the 2D workspace */
  position: Point2D;
  /** Rotation in degrees */
  rotation: number;
  /** Whether this piece is mirrored */
  mirrored: boolean;
  /** Seam allowance in mm (0 = none) */
  seamAllowance: number;
  /**
   * Provenance: when true, the outline IS the cut line (e.g., DXF import —
   * the boundary layer is the contour the patternmaker cuts). Suppresses the
   * synthetic default seam-allowance offset: the system must never invent
   * geometry the file does not carry. An explicit per-piece seamAllowance
   * still wins (the user asked for it).
   */
  outlineIsCutLine?: boolean;
  /** Default corner type for all vertices. Default 'mitered'. */
  defaultCornerType?: CornerType;
  /** Per-vertex corner type overrides. Key = outline command index. */
  cornerTypes?: Record<number, CornerType>;
  /** Rich grainline */
  grainLine?: GrainLine;
  /** Rich dart entities */
  darts?: Dart[];
  /** Piece type classification */
  category?: PieceCategory;
  /** Which side of the garment */
  side?: PieceSide;
  /** Named semantic edges (armhole, shoulder, hemline, etc.) */
  edges?: SemanticEdge[];
  /** Per-point grade rules for imported/flat pieces (Level 1 — shallow parametric grading, #847 choice A). */
  gradeRules?: PointGradeRule[];
  /** Fabric assignment (links to PhysicalFabric for simulation) */
  fabricId?: string;
  /** Production fabric code classification (SELF, LINING, etc.) */
  fabricCode?: string;
  /** Link to construction piece (for overlay alignment) */
  constructionPieceId?: string;
  /** ID of the linked partner piece (bidirectional) */
  linkedPieceId?: string;
  /** Link mode: symmetry (mirror) or instance (identical copy) */
  linkMode?: 'symmetry' | 'instance';
  /** Rendering order in 2D canvas (higher = drawn on top). Default 0. */
  zOrder?: number;
  /** Garment layer (0=innermost/body, higher=outer). Auto-detected from category. Default 1. */
  layer?: number;
  /** Fine ordering within same layer. Higher = on top. Default 0. */
  sublayer?: number;
  /** Cached body region from garment placement. */
  bodyRegion?: string;
  /** When true, piece cannot be moved/edited interactively */
  locked?: boolean;
  /** Size label for graded variants (e.g., 'S', 'L'). Undefined for base pieces. */
  gradedSize?: string;
  /** Artwork graphics placed on this piece */
  artworks?: import('./artwork').PieceArtwork[];
  /** Whether this piece participates in simulation. Default true. */
  active: boolean;
  /** Interfacing type applied to this piece */
  interfacingType?: InterfacingType;
  /** Solidify factor (0-1) for extra stiffness */
  solidifyFactor?: number;
  /** Internal pressure in Pascals (0 = none, 10-500 typical for puffer/balloon) */
  pressurePa?: number;
  /** Production annotations (cutting instructions, QC notes, etc.) */
  annotations?: PieceAnnotation[];
  /** Pre-marking placement rules for nesting */
  placementRules?: PlacementRule[];
  createdAt: number;
  updatedAt: number;
}

// ─── Annotations ───

export type AnnotationCategory = 'cutting' | 'sewing' | 'qc' | 'general';
export type AnnotationPosition = 'center';

export interface PieceAnnotation {
  id: string;
  text: string;
  position: AnnotationPosition;
  category: AnnotationCategory;
  fontSize?: number;
}

// ─── Placement Rules (Pre-Marking for Nesting) ───

export type PlacementRuleType = 'atFold' | 'atEdge' | 'pairWith' | 'minDistance' | 'priority' | 'grainTilt';

export interface PlacementRule {
  type: PlacementRuleType;
  /** Numeric value: priority (1=highest), minDistance (mm), grainTilt (degrees) */
  value?: number;
  /** Target piece ID for pairWith / minDistance rules */
  targetPieceId?: string;
  /** Edge constraint for atEdge rule */
  edge?: 'left' | 'right';
}

// ─── Reference Images (2D pattern workspace background) ───

/** A background reference image imported into the 2D pattern editor for tracing. */
export interface ReferenceImage {
  id: string;
  filename: string;
  width: number;              // natural image width in px
  height: number;             // natural image height in px
  position: Point2D;          // position in pattern space (mm)
  scale: number;              // uniform scale factor
  rotation: number;           // degrees
  opacity: number;            // 0.0–1.0
  locked: boolean;
  visible: boolean;
  pixelsPerMm: number | null; // set by calibration, null = uncalibrated
}

// ─── Rich Dart Entity ───

/** Dart cap shape at the apex */
export type DartCapShape = 'pointed' | 'curved' | 'flat' | 'diamond';

/** Options stored on InternalLine for dart-specific metadata */
export interface DartOptions {
  capShape?: DartCapShape;
}

/**
 * Rich domain view of a dart, derived from `InternalLine{type:'dart'}`.
 *
 * Storage layer uses `InternalLine{type:'dart'}` (path data only) in
 * `pieces[].internals`. This Dart entity captures dart-specific semantics
 * (intake, apex, legs, foldDirection, capShape) for domain operations.
 *
 * Convert via `extractDartFromInternal` / `extractDarts` from
 * `src/utils/dartEntity.ts`. See `docs/reports/2026-04-30-drift-fase2-d1real-dart-internalline.md`
 * for the full contract.
 */
export interface Dart {
  id: string;
  /** Intake (width absorbed) in mm */
  intake: number;
  /** Apex point (dart vertex) */
  apex: Point2D;
  /** Two dart legs: arrays of points from edge to apex */
  legs: [Point2D[], Point2D[]];
  /** Which SemanticEdge the dart sits on */
  edgeId?: string;
  /** Fold direction */
  foldDirection: 'left' | 'right' | 'toward-center';
  /** Dart depth (length from edge to apex) in mm */
  depth?: number;
  /** Cap shape at the apex */
  capShape?: DartCapShape;
}

// ─── GrainLine Semantics ───

export type GrainDirection = 'lengthwise' | 'crosswise' | 'bias' | 'custom';

/** Rich grainline with direction semantics */
export interface GrainLine {
  id: string;
  /** Grain direction relative to fabric */
  direction: GrainDirection;
  /** Angle in degrees relative to piece (0 = vertical/lengthwise) */
  angle: number;
  /** Reference edge: "parallel to CB", "perpendicular to hem" */
  referenceEdge?: string;
  /** Visual path representation */
  path: PathCommand[];
}

/**
 * Discriminated union for internal line types stored in `pieces[].internals`.
 *
 * The `'dart'` variant is the **storage shape** (path data only); the rich
 * domain view is the `Dart` entity (`src/types/types.ts:148`). See bridge
 * module `src/utils/dartEntity.ts` for conversion. Other variants like
 * `'grainline'` have their own rich types (e.g., `GrainLine` interface);
 * the rest (`'fold'`, `'pleat'`, `'topstitch'`, `'reference'`, `'seam'`)
 * are storage-only by design. `'notch'` is storage-PLUS: its `path` is still
 * the render/export truth, but it may carry a parametric `notchAnchor`
 * (placement intent — see {@link NotchAnchor} and the notch-precision spec,
 * partially amending the D1-real "storage-only" framing for this variant).
 * `'seam'` is the imported sew/seam
 * line (DXF AAMA layer 84 / ASTM "SEW LINE" / Lectra "COUTURE") — display
 * fidelity for the patternmaker, distinct from `Seam` (the 3D sewing entity).
 *
 * Cross-ref: `docs/reports/2026-04-30-drift-fase2-d1real-dart-internalline.md`.
 */
export type InternalLineType = 'dart' | 'grainline' | 'notch' | 'fold' | 'pleat' | 'topstitch' | 'reference' | 'seam';

export type NotchShape = 'slit' | 't-notch' | 'v-internal' | 'v-external' | 'u-notch' | 'castle' | 'diamond';
export type NotchSubType = 'straightforward' | 'bisector' | 'intersection';

export interface NotchOptions {
  shape: NotchShape;
  subType: NotchSubType;
  length: number;    // mm, default 8
  width: number;     // mm, default 3
  angle: number;     // degrees, default 0
  count: number;     // 1, 2, or 3
}

/**
 * Parametric anchor for an edge-anchored notch (notch-precision F1,
 * `docs/superpowers/specs/2026-06-07-notch-precision-design.md`).
 *
 * Records HOW the notch was placed — arc distance along the outline from a
 * resolved reference point (a detected corner, stored as coordinates so the
 * data survives detector changes). The frozen `path` remains the source of
 * truth for render/export (D-2: path manda); the anchor feeds the precision
 * modal and manual pair-matching. Transforms that change the outline:
 * uniform grading scales `distanceMm` by the same factor; mirroring drops
 * the anchor (edge identity flips — re-mapping is the future "anchor manda"
 * upgrade, not this MVP).
 */
export interface NotchAnchor {
  refPoint: Point2D;       // reference corner/point, piece-local coords
  direction: 'cw' | 'ccw'; // measuring direction along the outline
  distanceMm: number;      // arc distance from refPoint, >= 0
}

/**
 * Per-measurement grade growth for one point.
 *
 * Unit contract: `deltaX`/`deltaY` are outline-coordinate units of point
 * movement per **one unit of the measurement value as passed to the grader**.
 * The measurement space and the outline must therefore share a convention —
 * today measurements reach the grader in cm (GradingTab converts mm→cm) and
 * outlines are in mm, so a value is "mm of travel per cm of measurement". A
 * producer of grade rules must honour this or movement is off by the unit
 * ratio. (Flagged in the Level-1 decision doc; pin before a producer ships.)
 */
export interface GradeRule {
  measurement: string;
  deltaX: number;
  deltaY: number;
}

/**
 * A grade rule bound to a point on a piece outline by arc-distance anchor
 * (reuses {@link NotchAnchor} — D-3: a patternmaker thinks "12cm from the
 * armhole", and the anchor survives outline resampling/renumbering). Drives
 * per-point grading of imported, history-less patterns (Level 1, shallow
 * parametricity — see
 * `docs/superpowers/plans/2026-06-18-level1-imported-pattern-editing-scope.md`).
 * The outline/path stays the render/export truth (D-2: path manda).
 */
export interface PointGradeRule {
  id: string;
  anchor: NotchAnchor;
  rules: GradeRule[];
}

export interface TopstitchOptions {
  stitchType: 'straight' | 'zigzag' | 'triple';
  stitchLength: number;
  offset: number;
  threadColor: string;
  rows: number;
}

export interface InternalLine {
  id: string;
  type: InternalLineType;
  path: PathCommand[];
  notchOptions?: NotchOptions;
  /** Parametric placement data for `'notch'` lines — see {@link NotchAnchor}. */
  notchAnchor?: NotchAnchor;
  topstitchOptions?: TopstitchOptions;
  foldOptions?: FoldOptions;
  dartOptions?: DartOptions;
}

// ─── Fold Options ───

export interface FoldOptions {
  direction: 'mountain' | 'valley';
  creaseAngleDeg: number;
  pleatId?: string;
}

// ─── Pleats ───

export type PleatType = 'knife' | 'box' | 'accordion' | 'invertedBox';

export interface Pleat {
  id: string;
  pieceId: string;
  edgeName: string;
  type: PleatType;
  depth: number;
  spacing: number;
  count: number;
  direction: 'left' | 'right';
  tStart: number;
  tEnd: number;
  generatedLineIds: string[];
}

export const PLEAT_DEFAULTS: Omit<Pleat, 'id' | 'pieceId' | 'edgeName' | 'generatedLineIds'> = {
  type: 'accordion',
  depth: 15,
  spacing: 20,
  count: 4,
  direction: 'left',
  tStart: 0,
  tEnd: 1,
};

export const MAX_PLEAT_COUNT = 50;

// ─── Piece Classification ───

export type PieceCategory = 'bodice' | 'sleeve' | 'collar' | 'skirt' | 'trouser' | 'waistband' | 'facing' | 'lining' | 'pocket' | 'cuff' | 'hood' | 'yoke' | 'other';
export type PieceSide = 'front' | 'back' | 'left' | 'right' | 'center' | 'both';

// ─── Semantic Edges ───

export type SemanticEdgeType = 'seam' | 'fold' | 'hem' | 'opening' | 'dart-leg' | 'unknown';

/**
 * A named edge on a pattern piece — enables copilot reasoning,
 * auto-sew matching, and labeled export (DXF/PDF).
 */
export interface SemanticEdge {
  /** Unique id within the piece */
  id: string;
  /** Human-readable name: "armhole", "shoulder", "sideSeam", "hemline", "centerBack" */
  name: string;
  /** Index range [start, end) in the outline PathCommand array */
  segmentRange: [number, number];
  /** Edge classification */
  edgeType: SemanticEdgeType;
  /** Helps auto-sew: "pairs with back-armhole" */
  matchHint?: string;
  /** Length in mm (computed) */
  length?: number;
  /**
   * Per-edge seam allowance width in mm. Undefined → inherit the piece-level
   * `seamAllowance` (most edges). Set per edge for real garment practice
   * (e.g. hem 40mm, armhole 10mm on one piece). Keyed by the stable edge id,
   * so it survives outline mutations that renumber positional indices.
   */
  seamAllowanceWidth?: number;
}

// ─── Seams (connections between pieces) ───

/** A seam connects two named edges from different pattern pieces */
export interface Seam {
  id: string;
  /** First piece + semantic edge name. The A half is the direction REFERENCE. */
  pieceA: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number };
  /**
   * Second piece + semantic edge name.
   *
   * `reversed` — sewing direction of the B half relative to A (CLO3D parity
   * plan Fase 5). When true, B's edge is traversed end→start: vertex
   * matching pairs A's t=0 with B's t=1 (`parameterizeEdge` inverts t).
   * Toggled by `reverseSeam` (Ctrl+B / panel / copilot tool). Lives on ONE
   * half by design — reversal is a relative property of the pair, and A is
   * the fixed reference. Undefined = false (legacy seams predate the field).
   */
  pieceB: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number; reversed?: boolean };
  /** Seam type affects 3D simulation */
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
  /** Tension applied to seam (0-200, default 100) */
  tension: number;
  /** Strength of the seam bond (0-1, default 1.0) */
  strength: number;
  /** Whether this seam participates in simulation. Default true. */
  active: boolean;
  /** Whether seam tape is applied */
  taped: boolean;
  /** Width of tape in mm (default 10) */
  tapeWidth: number;
  /**
   * Provenance: who created the seam. 'ai' = agent / auto-sew proposal (a
   * "review me" seam the human has not yet confirmed); 'human' = manual
   * sewing. Undefined is treated as 'human' (legacy seams predate the field).
   * Drives provenance coloring in SeamRenderer3D (amber AI / green human).
   */
  createdBy?: 'ai' | 'human';
  /**
   * Versión del motor de auto-cosido que generó esta costura (solo seams IA;
   * `SEAM_ENGINE_VERSION` en autoSew). Ausente = pre-versionado (motor 0).
   * Al restaurar un proyecto cuyo motor quedó atrás, el toast "Re-coser"
   * ofrece regenerarlas — sin esto un proyecto viejo arrastra costuras malas
   * para siempre (el autoSew generativo solo corre con seams vacías, y el
   * dedupe de runAutoSew bloquea las nuevas contra las viejas).
   */
  sewEngine?: number;
}

// ─── Elastics (edge-based elastic/gathering) ───

export type ElasticType = 'band' | 'shirring' | 'drawstring';

export interface Elastic {
  id: string;
  pieceId: string;
  edgeName: string;
  stretchRatio: number;   // 0.1–2.0
  width: number;          // mm
  type: ElasticType;
  tStart: number;         // 0.0–1.0
  tEnd: number;           // 0.0–1.0
  active: boolean;
}

export const ELASTIC_DEFAULTS: Omit<Elastic, 'id' | 'pieceId' | 'edgeName'> = {
  stretchRatio: 0.5,
  width: 12,
  type: 'band',
  tStart: 0,
  tEnd: 1,
  active: true,
};

export function clampStretchRatio(v: number): number {
  return Math.max(0.1, Math.min(2.0, v));
}

/** A seam group connects multiple edge segments between two sets of edges */
export interface SeamGroup {
  id: string;
  edgesA: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number }[];
  edgesB: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number }[];
  type: Seam['type'];
  tension: number;
  strength: number;
  active: boolean;
  taped: boolean;
  tapeWidth: number;
}

// ─── Points of Measure (POM) ────────────────────────────────────────────────

/** Measurement method — how the value is computed */
export type POMMethod = 'straight' | 'alongEdge' | 'circumference' | 'height' | 'surfaceTape';

/** Measurement category for grouping and filtering */
export type POMCategory = 'length' | 'width' | 'circumference' | 'height' | 'custom';

/** A reference point on a pattern piece (piece-local coordinates) */
export interface POMPoint {
  pieceId: string;
  edgeName?: string;
  t?: number;
  localPosition: Point2D;
}

/** Persistent named measurement */
export interface PointOfMeasure {
  id: string;
  name: string;
  category: POMCategory;
  method: POMMethod;
  pointA: POMPoint;
  pointB: POMPoint;
  value: number;
  tolerance?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Interfacing ───

export type InterfacingType = 'none' | 'fusible-light' | 'fusible-medium' | 'fusible-heavy' | 'sew-in-light' | 'sew-in-heavy' | 'canvas';

// ─── Seam Allowance Corner Types ───

export type CornerType =
  | 'mitered'
  | 'doubleMitered'
  | 'envelope'
  | 'squared'
  | 'slant'
  | 'match'
  | 'trimMirrored';

// ─── Fabrics ───

/**
 * Project fabric catalog entry — persistent project state.
 *
 * Stored in `projectState.fabrics[]`. Used by save/load, BOM, DXF export.
 * For sim engineering parameters, see `PhysicalFabric`
 * (`src/utils/cloth/physicalFabric.ts`). For plugin/copilot basic shape,
 * see `FabricMaterial` (`src/utils/cloth/fabricLibrary.ts`).
 *
 * Cross-ref: `docs/reports/2026-04-30-drift-fase2-d6-fabric-types.md`.
 */
export interface Fabric {
  id: string;
  name: string;
  /** Color or texture URL */
  color: string;
  textureUrl?: string;
  /** Physical properties for cloth sim */
  weight: number;       // g/m²
  stretch: number;      // 0-1 (0 = no stretch, 1 = full stretch)
  stiffness: number;    // 0-1 (0 = silk, 1 = denim)
  friction: number;     // 0-1
}

// ─── Colorways ───

export interface ColorwayOverride {
  color?: string;
  fabricId?: string;
  textureUrl?: string;
}

export interface Colorway {
  id: string;
  name: string;
  overrides: Record<string, ColorwayOverride | null>;
  isDefault?: boolean;
}

// ─── Body Measurements ───

export interface BodyMeasurements {
  // ─── Primary (existing, always shown) ───
  height: number;        // cm
  chest: number;
  waist: number;
  hips: number;
  shoulder: number;
  armLength: number;
  inseam: number;

  // ─── Torso ───
  neckCirc?: number;
  highBust?: number;
  lowBust?: number;
  ribCirc?: number;
  highHip?: number;

  // ─── Vertical Heights ───
  neckBackHeight?: number;
  waistHeight?: number;
  hipHeight?: number;
  kneeHeight?: number;

  // ─── Widths ───
  shoulderWidth?: number;
  bustWidth?: number;
  waistWidth?: number;
  hipWidth?: number;

  // ─── Lengths Front/Back ───
  neckToWaistFront?: number;
  neckToWaistBack?: number;
  shoulderToWaistFront?: number;
  shoulderToWaistBack?: number;
  waistToHipFront?: number;
  waistToHipBack?: number;
  waistToKnee?: number;
  waistToFloor?: number;
  crotchLength?: number;

  // ─── Arms ───
  upperArmCirc?: number;
  elbowCirc?: number;
  wristCirc?: number;
  shoulderToElbow?: number;
  elbowToWrist?: number;
  armscyeDepth?: number;

  // ─── Legs ───
  thighCirc?: number;
  kneeCirc?: number;
  calfCirc?: number;
  ankleCirc?: number;

  // ─── Bust/Dart ───
  bustPointToBustPoint?: number;
  bustPointToNeckSide?: number;
  dartWidthBust?: number;
  dartWidthWaist?: number;

  // ─── Derived / Pattern Construction ───
  backLength?: number;     // cm (nape to waist)
  frontLength?: number;    // cm (shoulder to waist over bust)
  armholeDepth?: number;   // cm
}

// ─── Avatar ───

export interface Avatar {
  id: string;
  name: string;
  /** Path to GLTF/GLB model */
  modelUrl: string;
  /** Body measurements for parametric adjustment */
  measurements: BodyMeasurements;
}

// ─── Garment Info ───

export interface GarmentInfo {
  brand?: string;
  season?: string;
  styleNumber?: string;
  designer?: string;
  date?: string;
  notes?: string;
  description?: string;
}

// ─── Notch mirror pairs (Alcance B1) ───

/**
 * A declared notch-mirror pair: notch `a` and notch `b` are the SAME seam point
 * on the two pieces a seam joins. Identity only — the geometric correspondence
 * is re-derived on demand (mapNotchAcrossSeam), never maintained through
 * transforms. `invert` records the traversal sense chosen at creation so the
 * pair can be re-derived/verified. GC'd when either piece or line is removed.
 */
export interface NotchPair {
  id: string;
  a: { pieceId: string; lineId: string };
  b: { pieceId: string; lineId: string };
  seamId: string;
  invert: boolean;
}

// ─── Project ───

export interface OpenCloProject {
  id: string;
  name: string;
  description?: string;
  pieces: PatternPiece[];
  seams: Seam[];
  fabrics: Fabric[];
  avatar: Avatar;
  /** Named piece groups (optional for backward compat) */
  groups?: PieceGroup[];
  /** Points of measure (optional for backward compat) */
  poms?: PointOfMeasure[];
  /** Named seam groups (optional for backward compat) */
  seamGroups?: SeamGroup[];
  /** Declared notch-mirror pairs (Alcance B1): "these two notches ARE a pair
   *  across this seam". Persistent IDENTITY only — position is re-derived
   *  on-demand (no enforcement through transforms). Spec
   *  2026-06-09-notch-mirror-alcance-b-design.md. Optional for backward compat. */
  notchPairs?: NotchPair[];
  /** Garment metadata (brand, season, style, etc.) */
  garmentInfo?: GarmentInfo;
  /** Reference images for 2D tracing (optional for backward compat) */
  referenceImages?: ReferenceImage[];
  /** Trim placements (optional for backward compat) */
  trims?: import('./trim').Trim[];
  /** Base64-encoded image blobs keyed by imageId (present in .openclo.json files only) */
  referenceImageData?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

// ─── Piece Groups ───

/** A named group of pattern pieces for batch operations. */
export interface PieceGroup {
  id: string;
  name: string;
  /** Ordered array of member piece IDs */
  pieceIds: string[];
  /** Display color for UI indicators (hex) */
  color: string;
  createdAt: number;
  updatedAt: number;
}

// ─── UI State ───

export type ViewMode = '2d' | '3d' | 'split';

export type Tool2D =
  | 'select'
  | 'transform'    // move/rotate/scale with gizmo
  | 'editPattern'  // edit points and segments (Q key)
  | 'editCurve'    // edit curve points
  | 'editConstrain' // edit with constraints
  | 'movePattern'  // move pattern pieces
  | 'copyPattern'  // copy/paste pattern pieces
  | 'pen'          // draw piece outlines (bezier)
  | 'line'         // straight lines / darts
  | 'internalShape' // internal shape (dashed rectangle)
  | 'rectangle'    // quick rectangular pieces
  | 'seam'         // connect edges between pieces
  | 'segmentSewing' // connect partial edge segments
  | 'topstitchSeamline'  // topstitch along seam edge
  | 'topstitchSegment'   // topstitch partial edge segment
  | 'topstitchFree'      // freeform topstitch polyline
  | 'topstitchEdit'      // edit existing topstitch
  | 'seamAllowance' // seam allowance editing
  | 'notch'        // add notch marks
  | 'grainline'    // set fabric grain direction
  | 'duplicate'    // duplicate pieces
  | 'grading'      // grading tool
  | 'textAnnotation' // text annotation
  | 'elastic'      // elastic/gathering
  | 'addPiece'     // add new piece
  | 'fabricTexture' // fabric/texture assignment
  | 'flatten'      // flatten/iron
  | 'measure'      // distance / angle measurement
  | 'measureCurve'  // arc-length along a curve
  | 'compareCurves' // compare two curve lengths
  | 'pomMeasure'    // points of measure tool
  | 'walkSeam'      // walk seam verification
  | 'scissors'     // split pattern pieces
  | 'slashAndSpread' // slash and spread for fullness
  | 'merge'        // merge adjacent pattern pieces
  | 'freesewing'   // free sewing between edges
  | 'offsetOutline' // offset piece outline inward/outward
  | 'extendTrim'   // extend or trim edges
  | 'polyPen'      // combined straight + bezier pen
  | 'pleat'        // add/edit pleats along piece edges
  | 'trimPlace'    // place trims on piece edges
  | 'hand'         // pan
  | 'zoom';

/** 3D viewport tools (re-homed from the deleted Toolbar3D component, 2026-06-04). */
export type Tool3D = 'camera' | 'edit' | 'sew3d' | 'pose' | 'avatar' | 'arrangement' | 'pin' | 'meshSelectBox' | 'meshSelectLasso';

export type UnitSystem = 'mm' | 'cm' | 'inches';

/** Seam-allowance tool selection — a discriminated set: N edges OR N vertices,
 *  never mixed (exclusivity by construction). Items accumulate with Shift. */
export type SaSelection =
  | { kind: 'edge'; items: { pieceId: string; edgeId: string }[] }
  | { kind: 'vertex'; items: { pieceId: string; vertexIndex: number }[] };

export interface EditorState {
  viewMode: ViewMode;
  activeTool: Tool2D;
  selectedPieceIds: string[];
  selectedSeamId: string | null;
  selectedPOMId: string | null;
  selectedElasticId: string | null;
  selectedInternalLine: { pieceId: string; lineId: string } | null;
  /** Seam-allowance tool selection: a typed, mutually-exclusive set — N edges OR
   *  N vertices, never mixed. Replaces the old single selectedEdge/selectedVertex
   *  pair (multi-select Shift; spec 2026-06-09-selection-model-multiselect-design). */
  saSelection: SaSelection | null;
  /** Notch-mirror sense (F3): true = paired edge sewn opposite-direction (the
   *  normal right-sides-together case) → 1-frac. Optional; defaults to true. */
  notchMirrorInvert?: boolean;
  zoom2D: number;
  pan2D: Point2D;
  /** Monotonic counter: bumped to request a fit-to-content of the 2D viewport
   *  (e.g. right after a pattern is imported). The PatternEditor watches it and
   *  fits once per change, using the live viewport size. Preserved across
   *  NEW_PROJECT so a fresh import after File ▸ New still triggers a fit. */
  fitViewToken: number;
  showSeamAllowance: boolean;
  defaultSeamAllowanceWidth: number;  // mm fallback when piece has no SA set
  showGrainlines: boolean;
  showAnchorPoints: boolean;
  showPieceNames: boolean;
  showLineLengths: boolean;
  showSewingLines: boolean;
  renderMode2D: 'textured' | 'translucent' | 'wireframe';
  snapToGrid: boolean;
  gridSize: number;       // mm
  units: UnitSystem;
  /** Clipboard for copy/paste */
  clipboard: {
    pieces: PatternPiece[];
  } | null;
  /** Superimpose pick mode — active when user is picking a target piece */
  superimposePickMode: {
    active: boolean;
    sourcePieceId: string | null;
    mode: 'over' | 'under' | 'side' | null;
  } | null;
  /** Global toggle for reference image overlays */
  showReferenceImages: boolean;
  /** ID of the currently selected reference image (for highlight) */
  selectedReferenceImageId: string | null;
  /** Two-click calibration flow: active when user is setting scale ruler */
  calibrationMode: {
    imageId: string;
    point1: Point2D | null;  // first click; null = awaiting
  } | null;
}
