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
  /** Fabric assignment */
  fabricId?: string;
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
  /** Whether this piece participates in simulation. Default true. */
  active: boolean;
  /** Interfacing type applied to this piece */
  interfacingType?: InterfacingType;
  /** Solidify factor (0-1) for extra stiffness */
  solidifyFactor?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Rich Dart Entity ───

/** A dart with full geometric and semantic data */
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

export type InternalLineType = 'dart' | 'grainline' | 'notch' | 'fold' | 'pleat' | 'topstitch' | 'reference';

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
  topstitchOptions?: TopstitchOptions;
}

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
}

// ─── Seams (connections between pieces) ───

/** A seam connects two named edges from different pattern pieces */
export interface Seam {
  id: string;
  /** First piece + semantic edge name */
  pieceA: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number };
  /** Second piece + semantic edge name */
  pieceB: { pieceId: string; edgeName: string; tStart?: number; tEnd?: number };
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

// ─── Fabrics ───

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
  /** Garment metadata (brand, season, style, etc.) */
  garmentInfo?: GarmentInfo;
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
  | 'editPattern'  // edit points and segments (Z key)
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
  | 'merge'        // merge adjacent pattern pieces
  | 'freesewing'   // free sewing between edges
  | 'offsetOutline' // offset piece outline inward/outward
  | 'extendTrim'   // extend or trim edges
  | 'polyPen'      // combined straight + bezier pen
  | 'hand'         // pan
  | 'zoom';

export type UnitSystem = 'mm' | 'cm' | 'inches';

export interface EditorState {
  viewMode: ViewMode;
  activeTool: Tool2D;
  selectedPieceIds: string[];
  selectedSeamId: string | null;
  selectedPOMId: string | null;
  selectedInternalLine: { pieceId: string; lineId: string } | null;
  zoom2D: number;
  pan2D: Point2D;
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
}
