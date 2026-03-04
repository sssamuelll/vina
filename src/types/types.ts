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

export type InternalLineType = 'dart' | 'grainline' | 'notch' | 'fold' | 'pleat';

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

export interface InternalLine {
  id: string;
  type: InternalLineType;
  path: PathCommand[];
  notchOptions?: NotchOptions;
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

/** A seam connects two edges from different pattern pieces */
export interface Seam {
  id: string;
  /** First piece + edge segment indices */
  pieceA: { pieceId: string; edgeStart: number; edgeEnd: number };
  /** Second piece + edge segment indices */
  pieceB: { pieceId: string; edgeStart: number; edgeEnd: number };
  /** Seam type affects 3D simulation */
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
}

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

// ─── Project ───

export interface OpenCloProject {
  id: string;
  name: string;
  description?: string;
  pieces: PatternPiece[];
  seams: Seam[];
  fabrics: Fabric[];
  avatar: Avatar;
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
  | 'scissors'     // split pattern pieces
  | 'merge'        // merge adjacent pattern pieces
  | 'hand'         // pan
  | 'zoom';

export type UnitSystem = 'mm' | 'cm' | 'inches';

export interface EditorState {
  viewMode: ViewMode;
  activeTool: Tool2D;
  selectedPieceIds: string[];
  selectedSeamId: string | null;
  selectedInternalLine: { pieceId: string; lineId: string } | null;
  zoom2D: number;
  pan2D: Point2D;
  showSeamAllowance: boolean;
  defaultSeamAllowanceWidth: number;  // mm fallback when piece has no SA set
  showGrainlines: boolean;
  showAnchorPoints: boolean;
  snapToGrid: boolean;
  gridSize: number;       // mm
  units: UnitSystem;
}
