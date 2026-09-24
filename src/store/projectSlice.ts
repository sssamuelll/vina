/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PatternPiece, Seam, SeamGroup, Fabric, Avatar, VinaProject, InternalLine, NotchAnchor, NotchOptions, NotchPair, PathCommand, PieceGroup, PointOfMeasure, Colorway, Pleat, MAX_PLEAT_COUNT, Elastic, clampStretchRatio, ReferenceImage, SeamAllowanceSpan, Trazo } from '../types/types';
import type { ArrangementBinding, ArrangementOverride } from '../utils/cloth/arrangement/arrangementBinding';
import type { Trim } from '../types/trim';
import type { PieceArtwork } from '../types/artwork';
import { NEW_PROJECT } from './actions';
import { validateAndRepairProject } from '../utils/projectValidator';
import { generatePleatFoldLines } from '../utils/pleatGeometry';
import type { ValidationDiagnostic, Quarantine } from '../utils/projectValidator';
import { uid } from '../utils/pathHelpers';
import { newId } from '../utils/ids';
import { quitarTramo } from '../components/PatternEditor/trazos/trazoPath';
import { quitarTramos } from '../components/PatternEditor/lineaEditable';
import { detectSemanticEdges, preserveEdgeWidthsByName } from '../utils/semanticEdges';
import { reindexEdges, sameSegmentRanges } from '../utils/edgeReindex';
import { mirrorPctRange } from '../utils/seam/seamRange';
import { normalizeSpans } from '../utils/seam/allowanceSpans';
import { autoSew } from '../utils/autoSew';

function validSeamAllowanceSpan(span: SeamAllowanceSpan): SeamAllowanceSpan | null {
  if (![span.tStart, span.tEnd, span.width].every(Number.isFinite)) return null;
  const tStart = Math.max(0, Math.min(1, Math.min(span.tStart, span.tEnd)));
  const tEnd = Math.max(0, Math.min(1, Math.max(span.tStart, span.tEnd)));
  // El mismo mínimo del gesto evita que el panel fabrique restos invisibles.
  if (tEnd - tStart < 0.01) return null;
  return { tStart, tEnd, width: Math.max(0, span.width) };
}

// ─── Auto-rename duplicate pieces (e.g., all named "Detail" from Seamly2D) ────

/**
 * Approximate area of a closed outline using the shoelace formula
 * on the command endpoints.
 */
function approximateArea(outline: PathCommand[]): number {
  let cx = 0, cy = 0, area = 0;
  for (const cmd of outline) {
    let ex = cx, ey = cy;
    switch (cmd.type) {
      case 'M': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'L': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'H': ex = cmd.values[0]; break;
      case 'V': ey = cmd.values[0]; break;
      case 'C': ex = cmd.values[4]; ey = cmd.values[5]; break;
      case 'S': ex = cmd.values[2]; ey = cmd.values[3]; break;
      case 'Q': ex = cmd.values[2]; ey = cmd.values[3]; break;
      case 'T': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'A': ex = cmd.values[5]; ey = cmd.values[6]; break;
      case 'Z': continue;
      default: continue;
    }
    area += (cx * ey - ex * cy);
    cx = ex; cy = ey;
  }
  return Math.abs(area) / 2;
}

/**
 * When all pieces share the same name (e.g. "Detail" from Seamly2D imports),
 * assign meaningful names based on geometric analysis so that downstream
 * semantic-edge detection and auto-sew can work properly.
 */
function autoRenameDuplicatePieces(pieces: PatternPiece[]): void {
  if (pieces.length < 2) return;

  // Check if all pieces share the same name
  const names = new Set(pieces.map(p => p.name));
  if (names.size > 1) return; // Already have distinct names

  // Sort by area (largest first) to identify piece types
  const sorted = [...pieces].sort((a, b) => {
    return approximateArea(b.outline) - approximateArea(a.outline);
  });

  const count = sorted.length;

  if (count === 5) {
    // T-shirt pattern: 2 large bodice pieces, 2 medium sleeves, 1 small neckband
    const [p0, p1, p2, p3, p4] = sorted;

    p0.name = 'Front Bodice';
    p0.category = 'bodice';
    p0.side = 'front';

    p1.name = 'Back Bodice';
    p1.category = 'bodice';
    p1.side = 'back';

    p2.name = 'Sleeve Left';
    p2.category = 'sleeve';
    p2.side = 'left';

    p3.name = 'Sleeve Right';
    p3.category = 'sleeve';
    p3.side = 'right';

    p4.name = 'Neckband';
    p4.category = 'collar';
  } else if (count === 4) {
    // Possible: 2 bodice + 2 sleeves (no neckband)
    const [p0, p1, p2, p3] = sorted;

    p0.name = 'Front Bodice';
    p0.category = 'bodice';
    p0.side = 'front';

    p1.name = 'Back Bodice';
    p1.category = 'bodice';
    p1.side = 'back';

    p2.name = 'Sleeve Left';
    p2.category = 'sleeve';
    p2.side = 'left';

    p3.name = 'Sleeve Right';
    p3.category = 'sleeve';
    p3.side = 'right';
  } else if (count === 3) {
    // Possible: 2 bodice + 1 sleeve (fold symmetry)
    const [p0, p1, p2] = sorted;

    p0.name = 'Front Bodice';
    p0.category = 'bodice';
    p0.side = 'front';

    p1.name = 'Back Bodice';
    p1.category = 'bodice';
    p1.side = 'back';

    p2.name = 'Sleeve';
    p2.category = 'sleeve';
  } else if (count === 2) {
    const [p0, p1] = sorted;

    p0.name = 'Front';
    p0.category = 'bodice';
    p0.side = 'front';

    p1.name = 'Back';
    p1.category = 'bodice';
    p1.side = 'back';
  } else {
    // Generic fallback: name by size order
    for (let i = 0; i < sorted.length; i++) {
      sorted[i].name = `Piece ${i + 1}`;
    }
  }
}

const CATEGORY_DEFAULT_LAYER: Record<string, number> = {
  lining: 0, facing: 0,
  bodice: 1, skirt: 1, trouser: 1, waistband: 1, sleeve: 1,
  collar: 2, cuff: 2, pocket: 2, yoke: 2, hood: 2,
  other: 1,
};

function autoDetectLayer(category?: string): number {
  return CATEGORY_DEFAULT_LAYER[category ?? 'other'] ?? 1;
}

/** Lateral offset in metres when superimposing a piece in 'side' mode. */
const SUPERIMPOSE_SIDE_OFFSET_M = 0.1;

const defaultAvatar: Avatar = {
  id: 'default',
  name: 'Default Avatar',
  modelUrl: '',
  measurements: {
    height: 180,
    chest: 96,
    waist: 82,
    hips: 96,
    shoulder: 44,
    armLength: 64,
    inseam: 82,
  },
};

const defaultFabric: Fabric = {
  id: 'default-cotton',
  name: 'Cotton',
  color: '#e8e4df',
  weight: 150,
  stretch: 0.05,
  stiffness: 0.4,
  friction: 0.5,
};

export type AvatarMode = 'dressform' | 'model';

interface ProjectState {
  id: string;
  name: string;
  pieces: PatternPiece[];
  seams: Seam[];
  pleats: Pleat[];
  elastics: Elastic[];
  trims: Trim[];
  fabrics: Fabric[];
  avatar: Avatar;
  avatarMode: AvatarMode;
  avatarModelUrl: string | null;
  isDirty: boolean;
  /** Named piece groups for batch operations */
  groups: PieceGroup[];
  /** M:N seam groups connecting multiple edges */
  seamGroups: SeamGroup[];
  /** Per-piece 3D arrangement position overrides (piece ID → [x,y,z]) */
  /** Contrato de colocación (consejo 2026-07-03): V3 world legacy (drag) o
   *  ArrangementBinding frame-delta grading-safe (anchors / tool del agente).
   *  resolveArrangement es el ÚNICO resolutor — nadie re-aplica esto a mano. */
  arrangementOverrides: Record<string, ArrangementOverride>;
  /** Points of measure */
  poms: PointOfMeasure[];
  /** Declared notch-mirror pairs (Alcance B1) — identity only, re-derived.
   *  Optional + guarded (like elastics/trims) so partial test mocks still type. */
  notchPairs?: NotchPair[];
  /** Reference images for tracing in the 2D pattern editor */
  referenceImages: ReferenceImage[];
  /** Líneas de construcción sueltas en el lienzo (spec 2026-09-12). */
  trazos: Trazo[];
  /** Custom layer names (layer number → display name) */
  layerNames: Record<number, string>;
  /** Layer lock state (layer number → locked) */
  layerLocked: Record<number, boolean>;
  /** Garment metadata (brand, season, style, etc.) */
  garmentInfo?: import('../types/types').GarmentInfo;
  /** Diagnostics produced during the last loadProject call */
  loadDiagnostics: ValidationDiagnostic[];
  /** Entities quarantined (removed) during the last loadProject call */
  loadQuarantine: Quarantine;
  colorways: Colorway[];
  activeColorwayId: string | null;
}

const initialState: ProjectState = {
  id: 'new-project',
  name: 'Untitled Project',
  pieces: [],
  seams: [],
  pleats: [],
  elastics: [],
  trims: [],
  fabrics: [defaultFabric],
  avatar: defaultAvatar,
  avatarMode: 'model',
  avatarModelUrl: '/default-avatar.glb',
  isDirty: false,
  groups: [],
  seamGroups: [],
  arrangementOverrides: {},
  poms: [],
  notchPairs: [],
  referenceImages: [],
  trazos: [],
  layerNames: {},
  layerLocked: {},
  garmentInfo: {},
  loadDiagnostics: [] as ValidationDiagnostic[],
  loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] } as Quarantine,
  colorways: [],
  activeColorwayId: null,
};

/**
 * Shared load/restore body: validate + repair + backfill a project payload
 * into the slice draft. `generative` gates the IMPORT-only enrichment
 * (auto-rename duplicates, auto-sew) — a faithful RESTORE (boot autosave)
 * must return exactly what the user had saved, never invent seams or names.
 */
function applyProjectPayload(state: ProjectState, payload: VinaProject, generative: boolean): void {
  const { project: validated, diagnostics, quarantine } = validateAndRepairProject(payload);
  state.loadDiagnostics = diagnostics;
  state.loadQuarantine = quarantine;

  const p = validated;
  state.id = p.id;
  state.name = p.name;
  state.pieces = p.pieces;
  state.seams = p.seams;
  state.fabrics = p.fabrics;
  state.avatar = p.avatar;
  state.groups = p.groups ?? [];
  state.poms = p.poms ?? [];
  state.seamGroups = (p as any).seamGroups ?? [];
  state.notchPairs = (p as any).notchPairs ?? [];
  state.isDirty = false;
  // Backfill layer/sublayer for pieces loaded from older project files
  for (const piece of state.pieces) {
    if ((piece as any).layer === undefined) {
      piece.layer = autoDetectLayer(piece.category);
    }
    if ((piece as any).sublayer === undefined) {
      piece.sublayer = 0;
    }
    if ((piece as any).active === undefined) {
      piece.active = true;
    }
    if ((piece as any).interfacingType === undefined) piece.interfacingType = 'none';
    if ((piece as any).solidifyFactor === undefined) piece.solidifyFactor = 0;
  }
  // Auto-detect semantic edges on pieces that lack them
  for (const piece of state.pieces) {
    if ((!piece.edges || piece.edges.length === 0) && piece.outline?.length >= 3) {
      piece.edges = detectSemanticEdges(piece);
    }
  }

  if (generative) {
    // Auto-rename duplicate pieces (e.g., all named "Detail" from Seamly2D)
    autoRenameDuplicatePieces(state.pieces);

    // Re-detect edges on pieces that were renamed (category/side now set).
    // Per-edge SA widths survive the re-detection re-keyed by edge NAME
    // (Fase 6 — they vanished silently here on every generative load).
    for (const piece of state.pieces) {
      if (piece.category && piece.category !== 'other') {
        piece.edges = preserveEdgeWidthsByName(piece.edges, detectSemanticEdges(piece));
      }
    }

    // Auto-detect seams if none exist and pieces have edges
    if (state.seams.length === 0 && state.pieces.some(p => p.edges && p.edges.length > 0)) {
      // Adaptive confidence: lower threshold when pieces have duplicate names
      // (naming score will be 0, so only length + proximity + position contribute)
      const uniqueNames = new Set(state.pieces.map(p => p.name));
      const namingDiversity = uniqueNames.size / state.pieces.length;
      const adaptiveConfidence = namingDiversity < 0.5 ? 0.3 : 0.6;
      const result = autoSew(state.pieces, { minConfidence: adaptiveConfidence });
      if (result.seams.length > 0) {
        for (const proposed of result.seams) {
          state.seams.push(proposed.seam);
        }
        state.loadDiagnostics.push({
          severity: 'info',
          code: 'AUTO_SEAMS_DETECTED',
          message: `Auto-detected ${result.seams.length} seam(s). Review in the 2D editor. Undo with Ctrl+Z if incorrect.`,
        });
      }
    }
  }

  // Backfill sewing enhancement fields for seams from older projects
  for (const seam of state.seams) {
    if ((seam as any).tension === undefined) seam.tension = 100;
    if ((seam as any).strength === undefined) seam.strength = 1.0;
    if ((seam as any).active === undefined) seam.active = true;
    if ((seam as any).taped === undefined) seam.taped = false;
    if ((seam as any).tapeWidth === undefined) seam.tapeWidth = 10;
  }
  // Backfill layer metadata from older projects
  state.layerNames = (p as any).layerNames ?? {};
  state.layerLocked = (p as any).layerLocked ?? {};
  // Load reference image metadata (without objectUrl — blob restoration is async, done outside this reducer)
  state.referenceImages = (p as any).referenceImages ?? [];
  // Trazos (spec 2026-09-12 § 2.3): un proyecto anterior no los tiene.
  state.trazos = (p as any).trazos ?? [];
  state.trims = (p as any).trims ?? [];
}

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    restoreState(_state, action: PayloadAction<any>) {
      return action.payload;
    },
    loadProject(state, action: PayloadAction<VinaProject>) {
      applyProjectPayload(state, action.payload, true);
    },
    /**
     * Faithful restore (boot autosave / projectAutosave): validation +
     * backfill only — no auto-rename, no auto-sew. What was saved is what
     * comes back.
     */
    restoreProject(state, action: PayloadAction<VinaProject>) {
      applyProjectPayload(state, action.payload, false);
    },
    clearLoadDiagnostics(state) {
      state.loadDiagnostics = [];
      state.loadQuarantine = { pieces: [], seams: [], poms: [], seamGroups: [] };
    },
    setProjectName(state, action: PayloadAction<string>) {
      state.name = action.payload;
      state.isDirty = true;
    },
    setGarmentInfo(state, action: PayloadAction<{ field: string; value: string }>) {
      const VALID_FIELDS = new Set(['brand', 'season', 'styleNumber', 'designer', 'date', 'notes', 'description']);
      if (!VALID_FIELDS.has(action.payload.field)) return;
      if (!state.garmentInfo) state.garmentInfo = {};
      (state.garmentInfo as Record<string, string>)[action.payload.field] = action.payload.value;
      state.isDirty = true;
    },
    setGarmentInfoBulk(state, action: PayloadAction<import('../types/types').GarmentInfo>) {
      state.garmentInfo = action.payload;
      state.isDirty = true;
    },

    // ─── Pieces ───
    addPiece(state, action: PayloadAction<PatternPiece>) {
      const piece = { ...action.payload };
      if (piece.layer === undefined || piece.layer === null) {
        piece.layer = autoDetectLayer(piece.category);
      }
      if (piece.sublayer === undefined || piece.sublayer === null) {
        piece.sublayer = 0;
      }
      if (!piece.fabricCode) {
        piece.fabricCode = 'SELF';
      }
      // Auto-detect semantic edges if missing (guard against pieces without outline)
      if ((!piece.edges || piece.edges.length === 0) && piece.outline?.length >= 3) {
        piece.edges = detectSemanticEdges(piece);
      }
      state.pieces.push(piece);
      state.isDirty = true;
    },
    updatePiece(state, action: PayloadAction<PatternPiece>) {
      const idx = state.pieces.findIndex(p => p.id === action.payload.id);
      if (idx !== -1) {
        const prev = state.pieces[idx];
        const next = action.payload;
        // `segmentRange` es un rango de ÍNDICES sobre el contorno. Si el verbo
        // insertó o quitó comandos y el llamador se limitó a arrastrar los
        // bordes viejos, los índices apuntan al sitio equivocado — y como
        // `resolveEdgeName` saca de ahí el nombre que persiste en el `Seam`,
        // coser un lado podía guardarse como si fuera otro (#1043). Este es el
        // único sitio que ve el contorno viejo y el nuevo a la vez.
        // Un llamador que YA recalculó los bordes (tijeras, offset, unir) trae
        // rangos distintos y `sameSegmentRanges` lo deja pasar intacto.
        if (
          prev.outline?.length !== next.outline?.length
          && sameSegmentRanges(prev.edges, next.edges)
        ) {
          state.pieces[idx] = {
            ...next,
            edges: reindexEdges(next.edges, prev.outline, next.outline),
          };
        } else {
          state.pieces[idx] = next;
        }
        state.isDirty = true;
      }
    },
    removePiece(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.pieces = state.pieces.filter(p => p.id !== id);
      state.seams = state.seams.filter(
        s => s.pieceA.pieceId !== id && s.pieceB.pieceId !== id
      );
      if (state.elastics) state.elastics = state.elastics.filter(e => e.pieceId !== id);
      if (state.trims) state.trims = state.trims.filter(t => t.pieceId !== id);
      delete state.arrangementOverrides[id];
      // Auto-remove from all groups
      for (const group of state.groups) {
        group.pieceIds = group.pieceIds.filter(pid => pid !== id);
      }
      // Remove POMs referencing deleted piece
      state.poms = state.poms.filter(
        pom => pom.pointA.pieceId !== id && pom.pointB.pieceId !== id
      );
      // Remove notch-mirror pairs referencing the deleted piece (B1 GC)
      if (state.notchPairs) state.notchPairs = state.notchPairs.filter(
        np => np.a.pieceId !== id && np.b.pieceId !== id
      );
      state.isDirty = true;
    },
    removePieces(state, action: PayloadAction<string[]>) {
      const ids = new Set(action.payload);
      state.pieces = state.pieces.filter(p => !ids.has(p.id));
      state.seams = state.seams.filter(
        s => !ids.has(s.pieceA.pieceId) && !ids.has(s.pieceB.pieceId)
      );
      if (state.elastics) state.elastics = state.elastics.filter(e => !ids.has(e.pieceId));
      if (state.trims) state.trims = state.trims.filter(t => !ids.has(t.pieceId));
      for (const id of ids) {
        delete state.arrangementOverrides[id];
      }
      // Auto-remove from all groups
      for (const group of state.groups) {
        group.pieceIds = group.pieceIds.filter(pid => !ids.has(pid));
      }
      // Remove POMs referencing deleted pieces
      state.poms = state.poms.filter(
        pom => !ids.has(pom.pointA.pieceId) && !ids.has(pom.pointB.pieceId)
      );
      // Remove notch-mirror pairs referencing deleted pieces (B1 GC)
      if (state.notchPairs) state.notchPairs = state.notchPairs.filter(
        np => !ids.has(np.a.pieceId) && !ids.has(np.b.pieceId)
      );
      // Remove seamGroups referencing deleted pieces
      state.seamGroups = state.seamGroups.filter(
        g => !g.edgesA.some(e => ids.has(e.pieceId)) && !g.edgesB.some(e => ids.has(e.pieceId))
      );
      state.pleats = state.pleats.filter(p => !ids.has(p.pieceId));
      state.isDirty = true;
    },
    /** Set a 3D arrangement position override for a piece. */
    setArrangement3D(state, action: PayloadAction<{ pieceId: string; position: [number, number, number] }>) {
      state.arrangementOverrides[action.payload.pieceId] = action.payload.position;
      state.isDirty = true;
    },
    /** Escribe un binding de colocación grading-safe (contrato: click de
     *  anchor del humano o tool del agente — placementContract.ts). */
    setArrangementBinding(state, action: PayloadAction<{ pieceId: string; binding: ArrangementBinding }>) {
      state.arrangementOverrides[action.payload.pieceId] = action.payload.binding;
      state.isDirty = true;
    },
    /** Contrato de colocación: "reset" de una pieza = QUITAR su override
     *  (vuelve al auto-frame), NO escribir [0,0,0] world ("muévete al origen
     *  del mundo" — el bug que el consejo 2026-07-03 §6 manda a matar). */
    clearArrangementOverride(state, action: PayloadAction<string>) {
      delete state.arrangementOverrides[action.payload];
      state.isDirty = true;
    },
    /** Clear all 3D arrangement overrides. */
    clearArrangementOverrides(state) {
      state.arrangementOverrides = {};
      state.isDirty = true;
    },
    movePiece(state, action: PayloadAction<{ id: string; x: number; y: number }>) {
      const piece = state.pieces.find(p => p.id === action.payload.id);
      if (piece) {
        piece.position = { x: action.payload.x, y: action.payload.y };
        state.isDirty = true;
      }
    },
    addInternalLine(state, action: PayloadAction<{ pieceId: string; line: InternalLine }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        piece.internals.push(action.payload.line);
        state.isDirty = true;
      }
    },
    updateInternalLine(state, action: PayloadAction<{
      pieceId: string;
      lineId: string;
      path: PathCommand[];
      // Optional notch fields (notch-precision F3): the precision modal
      // re-positions a notch, which moves path AND anchor/depth together.
      notchAnchor?: NotchAnchor;
      notchOptions?: NotchOptions;
    }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        const line = piece.internals.find(l => l.id === action.payload.lineId);
        if (line) {
          line.path = action.payload.path;
          if (action.payload.notchAnchor !== undefined) line.notchAnchor = action.payload.notchAnchor;
          if (action.payload.notchOptions !== undefined) line.notchOptions = action.payload.notchOptions;
          piece.updatedAt = Date.now();
          state.isDirty = true;
        }
      }
    },
    removeInternalLine(state, action: PayloadAction<{ pieceId: string; lineId: string }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        const quitada = piece.internals.find(l => l.id === action.payload.lineId);
        piece.internals = piece.internals.filter(l => l.id !== action.payload.lineId);
        // Una pinza son dos datos enlazados por el id (#1016: el del Dart ES
        // el de su línea): su línea y su copia `piece.darts`. Quitar solo la
        // línea dejaba viva la copia, y la siguiente operación de pinza
        // (`applyDartsToInternals`) volvía a dibujar la que se borró (spec
        // 2026-09-24 § 7). Aquí y no en cada puerta: Supr desde Q, las dos de
        // Z y el menú contextual llegan todos a este reductor.
        if (quitada?.type === 'dart' && piece.darts) {
          piece.darts = piece.darts.filter(d => d.id !== quitada.id);
        }
        piece.updatedAt = Date.now();
        state.isDirty = true;
      }
      // Drop any notch-mirror pair referencing the removed line (B1 GC)
      const { pieceId, lineId } = action.payload;
      if (state.notchPairs) state.notchPairs = state.notchPairs.filter(
        np => !((np.a.pieceId === pieceId && np.a.lineId === lineId) || (np.b.pieceId === pieceId && np.b.lineId === lineId))
      );
    },
    /**
     * Supr sobre tramos de una interna (spec 2026-09-24 § 4.6): se quitan SOLO
     * esos tramos. El primer trozo conserva el id; los demás nacen con id nuevo
     * y el mismo tipo y opciones. Sin trozos, la interna se va. Un índice que
     * no es tramo no escribe nada (sin `isDirty`, sin paso de deshacer vacío).
     */
    removeTramosDeInterna(state, action: PayloadAction<{ pieceId: string; lineId: string; segmentIndices: number[] }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (!piece) return;
      const idx = piece.internals.findIndex(l => l.id === action.payload.lineId);
      if (idx < 0) return;
      const line = piece.internals[idx];
      const trozos = quitarTramos(line.path, new Set(action.payload.segmentIndices));
      if (trozos.length === 1 && trozos[0] === line.path) return;
      const nuevas = trozos.map((path, i) => (i === 0 ? { ...line, path } : { ...line, id: newId(), path }));
      piece.internals.splice(idx, 1, ...nuevas);
      piece.updatedAt = Date.now();
      state.isDirty = true;
    },
    /** Replace all internals of a given type (e.g. grainline — only one per piece) */
    setInternalLine(state, action: PayloadAction<{ pieceId: string; line: InternalLine }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        piece.internals = piece.internals.filter(l => l.type !== action.payload.line.type);
        piece.internals.push(action.payload.line);
        state.isDirty = true;
      }
    },
    // ─── Annotations ───
    addAnnotation(state, action: PayloadAction<{ pieceId: string; annotation: import('../types/types').PieceAnnotation }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        if (!piece.annotations) piece.annotations = [];
        piece.annotations.push(action.payload.annotation);
        piece.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    removeAnnotation(state, action: PayloadAction<{ pieceId: string; annotationId: string }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece && piece.annotations) {
        piece.annotations = piece.annotations.filter(a => a.id !== action.payload.annotationId);
        piece.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    updateAnnotation(state, action: PayloadAction<{ pieceId: string; annotationId: string; updates: Partial<import('../types/types').PieceAnnotation> }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece && piece.annotations) {
        const ann = piece.annotations.find(a => a.id === action.payload.annotationId);
        if (ann) {
          Object.assign(ann, action.payload.updates);
          piece.updatedAt = Date.now();
          state.isDirty = true;
        }
      }
    },
    rotatePiece(state, action: PayloadAction<{ id: string; rotation: number }>) {
      const piece = state.pieces.find(p => p.id === action.payload.id);
      if (piece) {
        piece.rotation = action.payload.rotation;
        state.isDirty = true;
      }
    },
    /** Duplicate a piece with a new ID and offset position. */
    duplicatePiece(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        const clone = JSON.parse(JSON.stringify(piece));
        clone.id = newId();
        clone.name = `${piece.name} (copy)`;
        clone.position = { x: (piece.position?.x ?? 0) + 30, y: (piece.position?.y ?? 0) + 30 };
        // Un clon es una pieza NUEVA, no la continuación de la vieja: hereda la
        // geometría y nada de la identidad. Sin esto, duplicar una pieza
        // vinculada deja el clon atado a la simetría de la original, y la fecha
        // heredada le miente a quien ordena por `createdAt` (#1126).
        clone.linkedPieceId = undefined;
        clone.linkMode = undefined;
        clone.createdAt = Date.now();
        clone.updatedAt = Date.now();
        state.pieces.push(clone);
        state.isDirty = true;
      }
    },
    /** Mirror/flip a piece horizontally (negate X coordinates). */
    flipPieceH(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece && piece.outline) {
        // Find center X
        let minX = Infinity, maxX = -Infinity;
        for (const cmd of piece.outline) {
          const v = cmd.values;
          for (let i = 0; i < v.length; i += 2) {
            if (v[i] < minX) minX = v[i];
            if (v[i] > maxX) maxX = v[i];
          }
        }
        const cx = (minX + maxX) / 2;
        // Flip X around center
        for (const cmd of piece.outline) {
          const v = cmd.values;
          if (cmd.type === 'M' || cmd.type === 'L') {
            v[0] = 2 * cx - v[0];
          } else if (cmd.type === 'H') {
            v[0] = 2 * cx - v[0];
          } else if (cmd.type === 'C') {
            v[0] = 2 * cx - v[0];
            v[2] = 2 * cx - v[2];
            v[4] = 2 * cx - v[4];
          } else if (cmd.type === 'Q') {
            v[0] = 2 * cx - v[0];
            v[2] = 2 * cx - v[2];
          }
        }
        state.isDirty = true;
      }
    },
    /** Mirror/flip a piece vertically (negate Y coordinates). */
    flipPieceV(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece && piece.outline) {
        let minY = Infinity, maxY = -Infinity;
        for (const cmd of piece.outline) {
          const v = cmd.values;
          for (let i = 1; i < v.length; i += 2) {
            if (v[i] < minY) minY = v[i];
            if (v[i] > maxY) maxY = v[i];
          }
        }
        const cy = (minY + maxY) / 2;
        for (const cmd of piece.outline) {
          const v = cmd.values;
          if (cmd.type === 'M' || cmd.type === 'L') {
            v[1] = 2 * cy - v[1];
          } else if (cmd.type === 'V') {
            v[0] = 2 * cy - v[0];
          } else if (cmd.type === 'C') {
            v[1] = 2 * cy - v[1];
            v[3] = 2 * cy - v[3];
            v[5] = 2 * cy - v[5];
          } else if (cmd.type === 'Q') {
            v[1] = 2 * cy - v[1];
            v[3] = 2 * cy - v[3];
          }
        }
        state.isDirty = true;
      }
    },

    // ─── Reactive Solver (upsert for parametric updates) ───
    /**
     * Update only the outline and position of an existing piece.
     * Preserves all other properties (seams, internals, selection, etc.)
     * Used by the reactive solver middleware for parametric updates.
     */
    upsertPieceOutline(state, action: PayloadAction<{
      pieceId: string;
      outline: PathCommand[];
      position: { x: number; y: number };
    }>) {
      const { pieceId, outline, position } = action.payload;
      const piece = state.pieces.find(p => p.id === pieceId);

      if (piece) {
        // Update only geometry, preserve everything else
        piece.outline = outline;
        piece.position = position;
        // Full outline replacement invalidates all vertex indices — clear corner types
        piece.cornerTypes = undefined;
        piece.updatedAt = Date.now();
        state.isDirty = true;
      } else {
        // Should not happen if identity map is correct
        console.warn('[upsertPieceOutline] Piece not found:', pieceId);
      }
    },

    /**
     * Batch update multiple piece outlines (more efficient for many pieces).
     */
    upsertMultiplePieceOutlines(state, action: PayloadAction<Array<{
      pieceId: string;
      outline: PathCommand[];
      position: { x: number; y: number };
    }>>) {
      const now = Date.now();
      for (const { pieceId, outline, position } of action.payload) {
        const piece = state.pieces.find(p => p.id === pieceId);
        if (piece) {
          piece.outline = outline;
          piece.position = position;
          // Full outline replacement invalidates all vertex indices — clear corner types
          piece.cornerTypes = undefined;
          piece.updatedAt = now;
        }
      }
      if (action.payload.length > 0) {
        state.isDirty = true;
      }
    },

    // ─── Seams ───
    addSeam(state, action: PayloadAction<Seam>) {
      const s = action.payload;
      const seam: Seam = {
        ...s,
        tension: s.tension ?? 100,
        strength: s.strength ?? 1.0,
        active: s.active ?? true,
        taped: s.taped ?? false,
        tapeWidth: s.tapeWidth ?? 10,
        // Provenance defaults to 'human': anything dispatched without an
        // explicit origin is treated as manual sewing. AI surfaces (agent
        // createSeam, auto-sew proposer) pass createdBy: 'ai' themselves.
        createdBy: s.createdBy ?? 'human',
      };
      state.seams.push(seam);
      state.isDirty = true;
    },
    removeSeam(state, action: PayloadAction<string>) {
      state.seams = state.seams.filter(s => s.id !== action.payload);
      state.isDirty = true;
    },
    updateSeam(state, action: PayloadAction<Seam>) {
      const idx = state.seams.findIndex(s => s.id === action.payload.id);
      if (idx !== -1) { state.seams[idx] = action.payload; state.isDirty = true; }
    },
    setSeamTension(state, action: PayloadAction<{ seamId: string; tension: number; strength?: number }>) {
      const seam = state.seams.find(s => s.id === action.payload.seamId);
      if (seam) {
        seam.tension = Math.max(10, Math.min(200, action.payload.tension));
        if (action.payload.strength !== undefined) {
          seam.strength = Math.max(0.01, Math.min(1.0, action.payload.strength));
        }
        state.isDirty = true;
      }
    },
    deactivateSeam(state, action: PayloadAction<{ seamId: string; active: boolean }>) {
      const seam = state.seams.find(s => s.id === action.payload.seamId);
      if (seam) { seam.active = action.payload.active; state.isDirty = true; }
    },
    deactivatePiece(state, action: PayloadAction<{ pieceId: string; active: boolean }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) { piece.active = action.payload.active; state.isDirty = true; }
    },
    // ─── Edge Reference Cascade ───
    cascadeEdgeRename(state, action: PayloadAction<{ pieceId: string; oldName: string; newName: string }>) {
      const { pieceId, oldName, newName } = action.payload;
      // Seams
      for (const s of state.seams) {
        if (s.pieceA.pieceId === pieceId && s.pieceA.edgeName === oldName) s.pieceA.edgeName = newName;
        if (s.pieceB.pieceId === pieceId && s.pieceB.edgeName === oldName) s.pieceB.edgeName = newName;
      }
      // Elastics
      if (state.elastics) for (const e of state.elastics) {
        if (e.pieceId === pieceId && e.edgeName === oldName) e.edgeName = newName;
      }
      // Pleats
      if (state.pleats) for (const p of state.pleats) {
        if (p.pieceId === pieceId && p.edgeName === oldName) p.edgeName = newName;
      }
      // Trims (edge-mode only)
      if (state.trims) for (const t of state.trims) {
        if (t.pieceId === pieceId && t.placement.mode === 'edge' && t.placement.edgeName === oldName) {
          (t.placement as { mode: 'edge'; edgeName: string; tStart: number; tEnd: number }).edgeName = newName;
        }
      }
      state.isDirty = true;
    },
    cascadeEdgeRemove(state, action: PayloadAction<{ pieceId: string; edgeName: string }>) {
      const { pieceId, edgeName } = action.payload;
      state.seams = state.seams.filter(s =>
        !(s.pieceA.pieceId === pieceId && s.pieceA.edgeName === edgeName) &&
        !(s.pieceB.pieceId === pieceId && s.pieceB.edgeName === edgeName),
      );
      if (state.elastics) state.elastics = state.elastics.filter(e => !(e.pieceId === pieceId && e.edgeName === edgeName));
      if (state.pleats) state.pleats = state.pleats.filter(p => !(p.pieceId === pieceId && p.edgeName === edgeName));
      if (state.trims) state.trims = state.trims.filter(t =>
        !(t.pieceId === pieceId && t.placement.mode === 'edge' && (t.placement as { edgeName: string }).edgeName === edgeName),
      );
      state.isDirty = true;
    },

    // ─── Placement Rules ───
    addPlacementRule(state, action: PayloadAction<{ pieceId: string; rule: import('../types/types').PlacementRule }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        if (!piece.placementRules) piece.placementRules = [];
        piece.placementRules.push(action.payload.rule);
        piece.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    removePlacementRule(state, action: PayloadAction<{ pieceId: string; ruleIndex: number }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece && piece.placementRules) {
        piece.placementRules.splice(action.payload.ruleIndex, 1);
        piece.updatedAt = Date.now();
        state.isDirty = true;
      }
    },

    /**
     * Reverse sewing direction (Ctrl+B / panel / copilot tool) — toggles
     * `pieceB.reversed` (parity plan Fase 5).
     *
     * History: this used to swap pieceA ↔ pieceB, which is a PHYSICAL
     * no-op — `matchVertices` pairs both edges by ascending t, so swapping
     * the halves produces the same constraint pairs. Real reversal flips
     * the traversal of one half relative to the other; `parameterizeEdge`
     * mirrors t for the B half when the flag is set.
     */
    reverseSeam(state, action: PayloadAction<string>) {
      const seam = state.seams.find(s => s.id === action.payload);
      if (seam) {
        seam.pieceB.reversed = seam.pieceB.reversed !== true;
        // Contrato seamRange.ts: el rango parcial de B vive en dirección de
        // COSIDO, así que todo toggle de `reversed` debe espejarlo con
        // mirrorPctRange o el solver cose la mitad física equivocada.
        if (seam.pieceB.tStart != null && seam.pieceB.tEnd != null) {
          [seam.pieceB.tStart, seam.pieceB.tEnd] = mirrorPctRange([
            seam.pieceB.tStart,
            seam.pieceB.tEnd,
          ]);
        }
        state.isDirty = true;
      }
    },

    // ─── Elastics ───
    addElastic(state, action: PayloadAction<Elastic>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (!piece) return;
      const edge = piece.edges?.find(e => e.name === action.payload.edgeName);
      if (!edge) return;
      if (action.payload.tStart >= action.payload.tEnd) return;
      state.elastics.push({
        ...action.payload,
        stretchRatio: clampStretchRatio(action.payload.stretchRatio),
      });
      state.isDirty = true;
    },
    removeElastic(state, action: PayloadAction<string>) {
      state.elastics = state.elastics.filter(e => e.id !== action.payload);
      state.isDirty = true;
    },
    updateElastic(state, action: PayloadAction<Partial<Elastic> & { id: string }>) {
      const idx = state.elastics.findIndex(e => e.id === action.payload.id);
      if (idx === -1) return;
      // Validate piece/edge if being changed
      if (action.payload.pieceId || action.payload.edgeName) {
        const pId = action.payload.pieceId ?? state.elastics[idx].pieceId;
        const eName = action.payload.edgeName ?? state.elastics[idx].edgeName;
        const piece = state.pieces.find(p => p.id === pId);
        if (!piece) return;
        const edge = piece.edges?.find(e => e.name === eName);
        if (!edge) return;
      }
      const updated = { ...state.elastics[idx], ...action.payload };
      updated.stretchRatio = clampStretchRatio(updated.stretchRatio);
      state.elastics[idx] = updated;
      state.isDirty = true;
    },

    // ─── Trims ───
    addTrim(state, action: PayloadAction<Trim>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (!piece) return;
      const { placement } = action.payload;
      if (placement.mode === 'edge') {
        const edge = piece.edges?.find(e => e.name === placement.edgeName);
        if (!edge) return;
        if (placement.tStart >= placement.tEnd) return;
      }
      if (placement.mode === 'point') {
        if (!placement.positions || placement.positions.length === 0) return;
      }
      if (placement.mode === 'edge-points') {
        const edge = piece.edges?.find(e => e.name === placement.edgeName);
        if (!edge) return;
        if (!placement.positions || placement.positions.length === 0) return;
        if (placement.positions.some(t => t < 0 || t > 1)) return;
      }
      state.trims.push(action.payload);
      state.isDirty = true;
    },
    removeTrim(state, action: PayloadAction<string>) {
      state.trims = state.trims.filter(t => t.id !== action.payload);
      state.isDirty = true;
    },
    updateTrim(state, action: PayloadAction<Partial<Trim> & { id: string }>) {
      const idx = state.trims.findIndex(t => t.id === action.payload.id);
      if (idx === -1) return;
      if (action.payload.pieceId) {
        const piece = state.pieces.find(p => p.id === action.payload.pieceId);
        if (!piece) return;
      }
      state.trims[idx] = { ...state.trims[idx], ...action.payload };
      state.isDirty = true;
    },

    // ─── Artworks ───
    addArtwork(state, action: PayloadAction<{ pieceId: string; artwork: PieceArtwork }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (!piece) return;
      const { artwork } = action.payload;
      if (artwork.width <= 0 || artwork.height <= 0) return;
      if (!piece.artworks) piece.artworks = [];
      piece.artworks.push({
        ...artwork,
        opacity: Math.max(0, Math.min(1, artwork.opacity)),
      });
      state.isDirty = true;
    },
    updateArtwork(state, action: PayloadAction<{ pieceId: string; artworkId: string; changes: Partial<PieceArtwork> }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (!piece?.artworks) return;
      const idx = piece.artworks.findIndex(a => a.id === action.payload.artworkId);
      if (idx === -1) return;
      const changes = { ...action.payload.changes };
      if (changes.width !== undefined && changes.width <= 0) return;
      if (changes.height !== undefined && changes.height <= 0) return;
      if (changes.opacity !== undefined) changes.opacity = Math.max(0, Math.min(1, changes.opacity));
      piece.artworks[idx] = { ...piece.artworks[idx], ...changes };
      state.isDirty = true;
    },
    removeArtwork(state, action: PayloadAction<{ pieceId: string; artworkId: string }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (!piece?.artworks) return;
      piece.artworks = piece.artworks.filter(a => a.id !== action.payload.artworkId);
      state.isDirty = true;
    },

    // ─── Points of Measure (POM) ───
    addPOM(state, action: PayloadAction<PointOfMeasure>) {
      state.poms.push(action.payload);
      state.isDirty = true;
    },
    updatePOM(state, action: PayloadAction<PointOfMeasure>) {
      const idx = state.poms.findIndex(p => p.id === action.payload.id);
      if (idx !== -1) {
        state.poms[idx] = action.payload;
        state.isDirty = true;
      }
    },
    removePOM(state, action: PayloadAction<string>) {
      state.poms = state.poms.filter(p => p.id !== action.payload);
      state.isDirty = true;
    },
    // ─── Notch mirror pairs (Alcance B1) — persistent identity, position re-derived ───
    addNotchPair(state, action: PayloadAction<NotchPair>) {
      if (!state.notchPairs) state.notchPairs = [];
      state.notchPairs.push(action.payload);
      state.isDirty = true;
    },
    removeNotchPair(state, action: PayloadAction<string>) {
      if (state.notchPairs) state.notchPairs = state.notchPairs.filter(np => np.id !== action.payload);
      state.isDirty = true;
    },
    recomputePOMValues(state, action: PayloadAction<Array<{ id: string; value: number }>>) {
      for (const { id, value } of action.payload) {
        const pom = state.poms.find(p => p.id === id);
        if (pom) pom.value = value;
      }
    },

    // ─── Reference Images ───
    addReferenceImage(state, action: PayloadAction<ReferenceImage>) {
      if (state.referenceImages.length >= 10) return; // max 10 images
      state.referenceImages.push(action.payload);
      state.isDirty = true;
    },
    removeReferenceImage(state, action: PayloadAction<string>) {
      state.referenceImages = state.referenceImages.filter(i => i.id !== action.payload);
      state.isDirty = true;
    },
    updateReferenceImage(state, action: PayloadAction<{ id: string } & Partial<ReferenceImage>>) {
      const idx = state.referenceImages.findIndex(i => i.id === action.payload.id);
      if (idx !== -1) {
        Object.assign(state.referenceImages[idx], action.payload);
        state.isDirty = true;
      }
    },

    // ─── Trazos: líneas de construcción (spec 2026-09-12) ───
    addTrazo(state, action: PayloadAction<Trazo>) {
      state.trazos.push(action.payload);
      state.isDirty = true;
    },
    updateTrazo(state, action: PayloadAction<{ id: string; path: PathCommand[] }>) {
      const trazo = state.trazos.find(t => t.id === action.payload.id);
      if (!trazo) return;
      trazo.path = action.payload.path;
      state.isDirty = true;
    },
    removeTrazo(state, action: PayloadAction<string>) {
      state.trazos = state.trazos.filter(t => t.id !== action.payload);
      state.isDirty = true;
    },
    /**
     * Supr sobre un tramo borra SOLO ese tramo (contrato 08-09 § 5). Del
     * medio quedan dos trazos: el original conserva su id a la izquierda y
     * la derecha nace con id nuevo. Con un solo nodo restante, se va.
     */
    removeTramoDeTrazo(state, action: PayloadAction<{ trazoId: string; segmentIndex: number }>) {
      const idx = state.trazos.findIndex(t => t.id === action.payload.trazoId);
      if (idx < 0) return;
      const trazo = state.trazos[idx];
      const [izquierda, derecha] = quitarTramo(trazo.path, action.payload.segmentIndex);
      // Un índice que no es tramo (0, o uno obsoleto) devuelve el path ORIGINAL
      // por referencia: seguir adelante reescribía el mismo trazo en otro objeto
      // y ponía `isDirty`, o sea un proyecto sucio sin cambio y un paso de
      // deshacer vacío.
      if (izquierda === trazo.path) return;
      const nuevos: Trazo[] = [];
      if (izquierda) nuevos.push({ ...trazo, path: izquierda });
      if (derecha) nuevos.push({ id: newId(), path: derecha, createdAt: Date.now() });
      state.trazos.splice(idx, 1, ...nuevos);
      state.isDirty = true;
    },

    // ─── Seam Groups (M:N sewing) ───
    addSeamGroup(state, action: PayloadAction<SeamGroup>) {
      state.seamGroups.push(action.payload);
      state.isDirty = true;
    },
    removeSeamGroup(state, action: PayloadAction<string>) {
      state.seamGroups = state.seamGroups.filter(g => g.id !== action.payload);
      state.isDirty = true;
    },

    // ─── Pleats ───
    addPleat(state, action: PayloadAction<Omit<Pleat, 'generatedLineIds'>>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (!piece) return;
      const edge = piece.edges?.find(e => e.name === action.payload.edgeName);
      if (!edge) return;
      const pleat: Pleat = {
        ...action.payload,
        count: Math.min(action.payload.count, MAX_PLEAT_COUNT),
        generatedLineIds: [],
      };
      const lines = generatePleatFoldLines(pleat, piece);
      lines.forEach(l => piece.internals.push(l));
      pleat.generatedLineIds = lines.map(l => l.id);
      state.pleats.push(pleat);
      state.isDirty = true;
    },
    removePleat(state, action: PayloadAction<string>) {
      const pleat = state.pleats.find(p => p.id === action.payload);
      if (!pleat) return;
      const piece = state.pieces.find(p => p.id === pleat.pieceId);
      if (piece) {
        piece.internals = piece.internals.filter(l => l.foldOptions?.pleatId !== pleat.id);
      }
      state.pleats = state.pleats.filter(p => p.id !== action.payload);
      state.isDirty = true;
    },
    updatePleat(state, action: PayloadAction<Partial<Pleat> & { id: string }>) {
      const idx = state.pleats.findIndex(p => p.id === action.payload.id);
      if (idx === -1) return;
      const pleat = state.pleats[idx];
      const piece = state.pieces.find(p => p.id === pleat.pieceId);
      if (!piece) return;
      // Remove old lines by pleatId scan (handles manual deletions)
      piece.internals = piece.internals.filter(l => l.foldOptions?.pleatId !== pleat.id);
      // Merge updates
      const updated: Pleat = {
        ...pleat,
        ...action.payload,
        count: Math.min((action.payload.count ?? pleat.count), MAX_PLEAT_COUNT),
      };
      // Recompute fold lines
      const lines = generatePleatFoldLines(updated, piece);
      lines.forEach(l => piece.internals.push(l));
      updated.generatedLineIds = lines.map(l => l.id);
      state.pleats[idx] = updated;
      state.isDirty = true;
    },

    // ─── Linked Editing ───
    linkPieces(state, action: PayloadAction<{ pieceIdA: string; pieceIdB: string; mode: 'symmetry' | 'instance' }>) {
      const { pieceIdA, pieceIdB, mode } = action.payload;
      const a = state.pieces.find(p => p.id === pieceIdA);
      const b = state.pieces.find(p => p.id === pieceIdB);
      if (a && b) {
        a.linkedPieceId = pieceIdB;
        a.linkMode = mode;
        b.linkedPieceId = pieceIdA;
        b.linkMode = mode;
        state.isDirty = true;
      }
    },
    unlinkPieces(state, action: PayloadAction<{ pieceId: string }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece?.linkedPieceId) {
        const partner = state.pieces.find(p => p.id === piece.linkedPieceId);
        if (partner) {
          partner.linkedPieceId = undefined;
          partner.linkMode = undefined;
        }
        piece.linkedPieceId = undefined;
        piece.linkMode = undefined;
        state.isDirty = true;
      }
    },
    cloneAsLinked(state, action: PayloadAction<{ pieceId: string; mode: 'symmetry' | 'instance' }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        const clone: PatternPiece = JSON.parse(JSON.stringify(piece));
        clone.id = newId();
        clone.name = `${piece.name} (linked)`;
        clone.position = { x: (piece.position?.x ?? 0) + 50, y: piece.position?.y ?? 0 };
        clone.linkedPieceId = piece.id;
        clone.linkMode = action.payload.mode;
        piece.linkedPieceId = clone.id;
        piece.linkMode = action.payload.mode;
        state.pieces.push(clone);
        state.isDirty = true;
      }
    },

    // ─── Layers ───
    setLayer(state, action: PayloadAction<{ pieceId: string; layer: number }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        piece.layer = Math.max(0, action.payload.layer);
        piece.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    setSublayer(state, action: PayloadAction<{ pieceId: string; sublayer: number }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        piece.sublayer = Math.max(0, action.payload.sublayer);
        piece.updatedAt = Date.now();
        state.isDirty = true;
      }
    },

    /**
     * Set (or clear) the per-edge seam allowance width on one semantic edge.
     * `width: null` clears it back to inheriting the piece-level seamAllowance.
     * Keyed by the stable edge id so it survives outline renumbering.
     */
    setEdgeSeamAllowance(state, action: PayloadAction<{ pieceId: string; edgeId: string; width: number | null }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      const edge = piece?.edges?.find(e => e.id === action.payload.edgeId);
      if (!edge) return;
      edge.seamAllowanceWidth = action.payload.width == null ? undefined : Math.max(0, action.payload.width);
      piece!.updatedAt = Date.now();
      state.isDirty = true;
    },
    /**
     * Añade la última intención sobre el borde sin conservar dos verdades para
     * el mismo punto. Un gesto produce un solo action y, por tanto, un solo undo.
     */
    addEdgeSeamAllowanceSpan(state, action: PayloadAction<{
      pieceId: string;
      edgeId: string;
      span: SeamAllowanceSpan;
    }>) {
      const piece = state.pieces.find(candidate => candidate.id === action.payload.pieceId);
      const edge = piece?.edges?.find(candidate => candidate.id === action.payload.edgeId);
      if (!piece || !edge) return;

      const span = validSeamAllowanceSpan(action.payload.span);
      if (!span) return;

      edge.seamAllowanceSpans = normalizeSpans([
        ...(edge.seamAllowanceSpans ?? []),
        span,
      ]);
      piece.updatedAt = Date.now();
      state.isDirty = true;
    },
    /**
     * El índice identifica la fila visible en el arreglo ya normalizado. La
     * edición vuelve a entrar como última escritura para resolver solapes igual
     * que un arrastre nuevo, sin una segunda regla escondida en el panel.
     */
    updateEdgeSeamAllowanceSpan(state, action: PayloadAction<{
      pieceId: string;
      edgeId: string;
      spanIndex: number;
      span: SeamAllowanceSpan;
    }>) {
      const piece = state.pieces.find(candidate => candidate.id === action.payload.pieceId);
      const edge = piece?.edges?.find(candidate => candidate.id === action.payload.edgeId);
      const spans = edge?.seamAllowanceSpans;
      const span = validSeamAllowanceSpan(action.payload.span);
      if (!piece || !edge || !spans?.[action.payload.spanIndex] || !span) return;

      edge.seamAllowanceSpans = normalizeSpans([
        ...spans.filter((_, index) => index !== action.payload.spanIndex),
        span,
      ]);
      piece.updatedAt = Date.now();
      state.isDirty = true;
    },
    /** Quitar la excepción devuelve esa zona al ancho heredado del borde. */
    removeEdgeSeamAllowanceSpan(state, action: PayloadAction<{
      pieceId: string;
      edgeId: string;
      spanIndex: number;
    }>) {
      const piece = state.pieces.find(candidate => candidate.id === action.payload.pieceId);
      const edge = piece?.edges?.find(candidate => candidate.id === action.payload.edgeId);
      const spans = edge?.seamAllowanceSpans;
      if (!piece || !edge || !spans?.[action.payload.spanIndex]) return;

      const remaining = spans.filter((_, index) => index !== action.payload.spanIndex);
      edge.seamAllowanceSpans = remaining.length > 0 ? remaining : undefined;
      piece.updatedAt = Date.now();
      state.isDirty = true;
    },
    /**
     * Bulk per-edge seam allowance (multi-select Shift: edit N edges' width in
     * ONE action). `width: null` clears the override (Inherit) on all. Grouped by
     * piece so state.pieces is scanned once, not per edge — one project/* dispatch
     * => one undo entry (no O(project) clone per edge). Mirrors setEdgeSeamAllowance.
     */
    setEdgesSeamAllowance(state, action: PayloadAction<{ items: { pieceId: string; edgeId: string }[]; width: number | null }>) {
      const { items, width } = action.payload;
      const byPiece = new Map<string, Set<string>>();
      for (const it of items) {
        let s = byPiece.get(it.pieceId);
        if (!s) { s = new Set(); byPiece.set(it.pieceId, s); }
        s.add(it.edgeId);
      }
      const w = width == null ? undefined : Math.max(0, width);
      for (const piece of state.pieces) {
        const edgeIds = byPiece.get(piece.id);
        if (!edgeIds || !piece.edges) continue;
        let touched = false;
        for (const edge of piece.edges) {
          if (edgeIds.has(edge.id)) { edge.seamAllowanceWidth = w; touched = true; }
        }
        if (touched) piece.updatedAt = Date.now();
      }
      if (items.length > 0) state.isDirty = true;
    },

    cloneToLayer(state, action: PayloadAction<{ pieceId: string; direction: 'over' | 'under' }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (!piece) return;
      const clone: PatternPiece = {
        ...JSON.parse(JSON.stringify(piece)),
        // state-encoded ID — see B10-state. The parent piece's id is
        // intentionally referenced in the clone id for cross-reference.
        // La cola es `newId()` y no `Date.now()`: es el hermano de #1190 y
        // falla igual. Dos clones de la misma pieza en el mismo milisegundo
        // daban el MISMO id —`direction` no entra en el id, así que 'over' y
        // 'under' colisionaban—, este reducer hace push sin deduplicar y
        // `removePiece` filtra por id, de modo que el rollback de
        // `layerTools.ts` borraba los dos clones y las costuras de ambos.
        // `duplicatePiece` ya usaba `newId()`; este era el último sin migrar.
        id: `${piece.id}-clone-${newId()}`,
        name: `${piece.name} (clone)`,
        layer: action.payload.direction === 'over'
          ? (piece.layer ?? 1) + 1
          : Math.max(0, (piece.layer ?? 1) - 1),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        // Mismo motivo que en `duplicatePiece`: clonar a otra capa tampoco es
        // pedir un vínculo (#1126).
        linkedPieceId: undefined,
        linkMode: undefined,
      };
      state.pieces.push(clone);
      const arrangement = state.arrangementOverrides[piece.id];
      if (arrangement) {
        // Contrato: V3 legacy se clona como array; binding frame-delta como objeto.
        state.arrangementOverrides[clone.id] = Array.isArray(arrangement)
          ? ([...arrangement] as [number, number, number])
          : { ...arrangement, posDelta: [...arrangement.posDelta] as [number, number, number], rotDelta: [...arrangement.rotDelta] as [number, number, number, number] };
      }
      state.isDirty = true;
    },

    superimposePiece(state, action: PayloadAction<{
      pieceId: string;
      targetPieceId: string;
      mode: 'over' | 'under' | 'side';
    }>) {
      const { pieceId, targetPieceId, mode } = action.payload;
      const piece = state.pieces.find(p => p.id === pieceId);
      const target = state.pieces.find(p => p.id === targetPieceId);
      if (!piece || !target) return;
      const targetPos = state.arrangementOverrides[targetPieceId];
      // Solo overrides V3 legacy: un binding frame-delta no lleva posición
      // world en el store (la resuelve resolveArrangement) — superimpose
      // sobre pieza bindeada queda como no-op documentado (contrato v1).
      if (targetPos && Array.isArray(targetPos)) {
        if (mode === 'side') {
          state.arrangementOverrides[pieceId] = [targetPos[0] + SUPERIMPOSE_SIDE_OFFSET_M, targetPos[1], targetPos[2]];
        } else {
          state.arrangementOverrides[pieceId] = [...targetPos] as [number, number, number];
        }
      }
      if (mode === 'over') {
        piece.layer = (target.layer ?? 1) + 1;
      } else if (mode === 'under') {
        piece.layer = Math.max(0, (target.layer ?? 1) - 1);
      }
      piece.updatedAt = Date.now();
      state.isDirty = true;
    },

    // ─── Layer Metadata ───
    /** Set a custom display name for a layer. */
    renameLayer(state, action: PayloadAction<{ layer: number; name: string }>) {
      state.layerNames[action.payload.layer] = action.payload.name;
      state.isDirty = true;
    },
    /** Remove a custom display name for a layer. */
    deleteLayerName(state, action: PayloadAction<{ layer: number }>) {
      delete state.layerNames[action.payload.layer];
      state.isDirty = true;
    },
    /** Lock or unlock a layer to prevent edits. */
    setLayerLocked(state, action: PayloadAction<{ layer: number; locked: boolean }>) {
      state.layerLocked[action.payload.layer] = action.payload.locked;
      state.isDirty = true;
    },
    /** Register or update a layer (sets the custom name if provided). */
    addLayer(state, action: PayloadAction<{ layer: number; name?: string }>) {
      if (action.payload.name) {
        state.layerNames[action.payload.layer] = action.payload.name;
      }
      state.isDirty = true;
    },
    /** Remove a layer and move its pieces to layer 1. */
    removeLayer(state, action: PayloadAction<{ layer: number }>) {
      const { layer } = action.payload;
      if (layer === 1) return; // cannot remove base layer
      for (const piece of state.pieces) {
        if ((piece.layer ?? 1) === layer) {
          piece.layer = 1;
          piece.updatedAt = Date.now();
        }
      }
      delete state.layerNames[layer];
      delete state.layerLocked[layer];
      state.isDirty = true;
    },

    // ─── Z-Order ───
    bringToFront(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        const maxZ = Math.max(0, ...state.pieces.map(p => p.zOrder ?? 0));
        piece.zOrder = maxZ + 1;
        state.isDirty = true;
      }
    },
    sendToBack(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        const minZ = Math.min(0, ...state.pieces.map(p => p.zOrder ?? 0));
        piece.zOrder = minZ - 1;
        state.isDirty = true;
      }
    },
    bringForward(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        piece.zOrder = (piece.zOrder ?? 0) + 1;
        state.isDirty = true;
      }
    },
    sendBackward(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        piece.zOrder = (piece.zOrder ?? 0) - 1;
        state.isDirty = true;
      }
    },

    // ─── Lock ───
    lockPiece(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        piece.locked = true;
        state.isDirty = true;
      }
    },
    unlockPiece(state, action: PayloadAction<string>) {
      const piece = state.pieces.find(p => p.id === action.payload);
      if (piece) {
        piece.locked = false;
        state.isDirty = true;
      }
    },

    // ─── Groups ───
    createGroup(state, action: PayloadAction<{ name: string; pieceIds: string[]; color?: string }>) {
      const { name, pieceIds, color } = action.payload;
      const GROUP_COLORS = ['#4a9eff', '#ff6b6b', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#20c997', '#845ef7'];
      state.groups.push({
        id: newId(),
        name,
        pieceIds: pieceIds.filter(id => state.pieces.some(p => p.id === id)),
        color: color ?? GROUP_COLORS[state.groups.length % GROUP_COLORS.length],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      state.isDirty = true;
    },
    renameGroup(state, action: PayloadAction<{ groupId: string; name: string }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        group.name = action.payload.name;
        group.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    deleteGroup(state, action: PayloadAction<{ groupId: string }>) {
      state.groups = state.groups.filter(g => g.id !== action.payload.groupId);
      state.isDirty = true;
    },
    setGroupColor(state, action: PayloadAction<{ groupId: string; color: string }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        group.color = action.payload.color;
        group.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    addPiecesToGroup(state, action: PayloadAction<{ groupId: string; pieceIds: string[] }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        const existing = new Set(group.pieceIds);
        for (const id of action.payload.pieceIds) {
          if (!existing.has(id) && state.pieces.some(p => p.id === id)) {
            group.pieceIds.push(id);
          }
        }
        group.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    removePiecesFromGroup(state, action: PayloadAction<{ groupId: string; pieceIds: string[] }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        const removeSet = new Set(action.payload.pieceIds);
        group.pieceIds = group.pieceIds.filter(id => !removeSet.has(id));
        group.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    moveGroup(state, action: PayloadAction<{ groupId: string; dx: number; dy: number }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        const memberSet = new Set(group.pieceIds);
        for (const piece of state.pieces) {
          if (memberSet.has(piece.id)) {
            piece.position = {
              x: (piece.position?.x ?? 0) + action.payload.dx,
              y: (piece.position?.y ?? 0) + action.payload.dy,
            };
            piece.updatedAt = Date.now();
          }
        }
        state.isDirty = true;
      }
    },
    setFabricCode(state, action: PayloadAction<{ pieceId: string; fabricCode: string }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        piece.fabricCode = action.payload.fabricCode;
        piece.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    /**
     * Persistent piece fabric assignment. Source-of-truth for `pieces[].fabricId`.
     *
     * Use for programmatic / copilot writes where the user's intent is to apply
     * a fabric persistently. Sim runtime cache (`simulation.pieceFabrics`) is
     * updated derivatively via `useColorwaySync`. For transient sim-only previews
     * (MaterialTab, SimulationView), use `simulation/setFabric` instead.
     *
     * Single-field shape: rollback is concurrency-safe (preserves intervening
     * edits to other piece fields). See B10-state Par 1 ratification doc.
     */
    setPieceFabric(state, action: PayloadAction<{ pieceId: string; fabricId: string | undefined }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) {
        piece.fabricId = action.payload.fabricId;
        piece.updatedAt = Date.now();
        state.isDirty = true;
      }
    },
    batchSetFabricCode(state, action: PayloadAction<{ pieceIds: string[]; fabricCode: string }>) {
      const idSet = new Set(action.payload.pieceIds);
      for (const piece of state.pieces) {
        if (idSet.has(piece.id)) {
          piece.fabricCode = action.payload.fabricCode;
          piece.updatedAt = Date.now();
        }
      }
      if (idSet.size > 0) state.isDirty = true;
    },
    setGroupFabric(state, action: PayloadAction<{ groupId: string; fabricId: string }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        const memberSet = new Set(group.pieceIds);
        for (const piece of state.pieces) {
          if (memberSet.has(piece.id)) {
            piece.fabricId = action.payload.fabricId;
            piece.updatedAt = Date.now();
          }
        }
        state.isDirty = true;
      }
    },
    setGroupSeamAllowance(state, action: PayloadAction<{ groupId: string; width: number }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        const memberSet = new Set(group.pieceIds);
        for (const piece of state.pieces) {
          if (memberSet.has(piece.id)) {
            piece.seamAllowance = action.payload.width;
            piece.updatedAt = Date.now();
          }
        }
        state.isDirty = true;
      }
    },
    // Bulk per-piece scalar SA write (drag-to-all: apply the editor default to
    // every touched piece in ONE action). Modeled on batchSetFabricCode — a
    // single project/* dispatch so undoMiddleware clones the tree once, not per
    // piece (the per-edge setEdgeSeamAllowance loop would clone O(project) per
    // edge → hang). Writes the level-2 scalar only; per-edge overrides untouched.
    batchSetSeamAllowance(state, action: PayloadAction<{ pieceIds: string[]; width: number }>) {
      const idSet = new Set(action.payload.pieceIds);
      const w = Math.max(0, action.payload.width);
      for (const piece of state.pieces) {
        if (idSet.has(piece.id)) {
          piece.seamAllowance = w;
          piece.updatedAt = Date.now();
        }
      }
      if (idSet.size > 0) state.isDirty = true;
    },
    mirrorGroup(state, action: PayloadAction<{ groupId: string }>) {
      const group = state.groups.find(g => g.id === action.payload.groupId);
      if (group) {
        const memberSet = new Set(group.pieceIds);
        for (const piece of state.pieces) {
          if (memberSet.has(piece.id)) {
            piece.mirrored = !piece.mirrored;
            piece.updatedAt = Date.now();
          }
        }
        state.isDirty = true;
      }
    },

    // ─── Fabrics ───
    addFabric(state, action: PayloadAction<Fabric>) {
      state.fabrics.push(action.payload);
    },
    updateFabric(state, action: PayloadAction<Fabric>) {
      const idx = state.fabrics.findIndex(f => f.id === action.payload.id);
      if (idx !== -1) state.fabrics[idx] = action.payload;
    },

    // ─── Avatar ───
    updateAvatar(state, action: PayloadAction<Partial<Avatar>>) {
      state.avatar = { ...state.avatar, ...action.payload };
    },
    updateMeasurements(state, action: PayloadAction<Partial<Avatar['measurements']>>) {
      state.avatar.measurements = { ...state.avatar.measurements, ...action.payload };
    },
    setAvatarMode(state, action: PayloadAction<AvatarMode>) {
      state.avatarMode = action.payload;
    },
    setAvatarModelUrl(state, action: PayloadAction<string | null>) {
      state.avatarModelUrl = action.payload;
      if (action.payload) state.avatarMode = 'model';
    },

    // ─── Colorways ───
    addColorway(state, action: PayloadAction<Omit<Colorway, 'id'>>) {
      // Reject duplicate names
      if (state.colorways.some(c => c.name === action.payload.name)) return;
      const id = uid();
      state.colorways.push({ ...action.payload, id });
      // Auto-activate first colorway
      if (state.colorways.length === 1) state.activeColorwayId = id;
      state.isDirty = true;
    },
    removeColorway(state, action: PayloadAction<string>) {
      state.colorways = state.colorways.filter(c => c.id !== action.payload);
      if (state.activeColorwayId === action.payload) {
        state.activeColorwayId = state.colorways[0]?.id ?? null;
      }
      state.isDirty = true;
    },
    updateColorway(state, action: PayloadAction<Partial<Colorway> & { id: string }>) {
      const idx = state.colorways.findIndex(c => c.id === action.payload.id);
      if (idx === -1) return;
      const existing = state.colorways[idx];
      // Deep-merge overrides; null values delete the entry
      if (action.payload.overrides) {
        const merged = { ...existing.overrides };
        for (const [key, val] of Object.entries(action.payload.overrides)) {
          if (val === null) {
            delete merged[key];
          } else {
            merged[key] = { ...(merged[key] || {}), ...val };
          }
        }
        state.colorways[idx] = { ...existing, ...action.payload, overrides: merged };
      } else {
        state.colorways[idx] = { ...existing, ...action.payload };
      }
      state.isDirty = true;
    },
    setActiveColorway(state, action: PayloadAction<string | null>) {
      if (action.payload === null || state.colorways.some(c => c.id === action.payload)) {
        state.activeColorwayId = action.payload;
      }
    },
    duplicateColorway(state, action: PayloadAction<{ sourceId: string; newName: string }>) {
      const source = state.colorways.find(c => c.id === action.payload.sourceId);
      if (!source) return;
      if (state.colorways.some(c => c.name === action.payload.newName)) return;
      const id = uid();
      state.colorways.push({
        ...structuredClone(source),
        id,
        name: action.payload.newName,
        isDefault: false,
      });
      state.isDirty = true;
    },
    renameColorway(state, action: PayloadAction<{ id: string; name: string }>) {
      const cw = state.colorways.find(c => c.id === action.payload.id);
      if (!cw) return;
      if (state.colorways.some(c => c.name === action.payload.name && c.id !== action.payload.id)) return;
      cw.name = action.payload.name;
      state.isDirty = true;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => ({
      ...initialState,
      id: newId(),
    }));
  },
});

export const {
  restoreState, loadProject, restoreProject, clearLoadDiagnostics, setProjectName, setGarmentInfo, setGarmentInfoBulk,
  addPiece, updatePiece, removePiece, removePieces, movePiece, rotatePiece, duplicatePiece, flipPieceH, flipPieceV, setArrangement3D, setArrangementBinding, clearArrangementOverride, clearArrangementOverrides,
  addInternalLine, updateInternalLine, removeInternalLine, setInternalLine, removeTramosDeInterna,
  addTrazo, updateTrazo, removeTrazo, removeTramoDeTrazo,
  addAnnotation, removeAnnotation, updateAnnotation,
  // Reactive solver (parametric updates)
  upsertPieceOutline, upsertMultiplePieceOutlines,
  addSeam, removeSeam, updateSeam, setSeamTension, deactivateSeam, deactivatePiece, reverseSeam, cascadeEdgeRename, cascadeEdgeRemove,
  addPlacementRule, removePlacementRule,
  addSeamGroup, removeSeamGroup,
  // Pleats
  addPleat, removePleat, updatePleat,
  addElastic, removeElastic, updateElastic,
  addTrim, removeTrim, updateTrim,
  // Artworks
  addArtwork, updateArtwork, removeArtwork,
  // POMs
  addPOM, updatePOM, removePOM, recomputePOMValues,
  addNotchPair, removeNotchPair,
  linkPieces, unlinkPieces, cloneAsLinked,
  // Per-edge seam allowance
  setEdgeSeamAllowance, setEdgesSeamAllowance, addEdgeSeamAllowanceSpan,
  updateEdgeSeamAllowanceSpan, removeEdgeSeamAllowanceSpan,
  // Layers
  setLayer, setSublayer, cloneToLayer, superimposePiece,
  renameLayer, deleteLayerName, setLayerLocked, addLayer, removeLayer,
  bringToFront, sendToBack, bringForward, sendBackward,
  lockPiece, unlockPiece,
  // Groups
  createGroup, renameGroup, deleteGroup, setGroupColor,
  addPiecesToGroup, removePiecesFromGroup,
  setFabricCode, batchSetFabricCode, setPieceFabric,
  moveGroup, setGroupFabric, setGroupSeamAllowance, batchSetSeamAllowance, mirrorGroup,
  addFabric, updateFabric,
  updateAvatar, updateMeasurements, setAvatarMode, setAvatarModelUrl,
  // Colorways
  addColorway, removeColorway, updateColorway, setActiveColorway, duplicateColorway, renameColorway,
  // Reference Images
  addReferenceImage, removeReferenceImage, updateReferenceImage,
} = projectSlice.actions;

const DEFAULT_LAYER_NAMES: Record<number, string> = { 0: 'Lining', 1: 'Shell', 2: 'Trims' };

export function getLayerDisplayName(state: { project: { layerNames: Record<number, string> } }, layer: number): string {
  return state.project.layerNames[layer] ?? DEFAULT_LAYER_NAMES[layer] ?? `Layer ${layer}`;
}

export default projectSlice.reducer;
