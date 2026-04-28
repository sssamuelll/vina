/**
 * Construction Engine Redux Slice
 * 
 * Manages the parametric construction state: points, lines, curves, and piece definitions.
 * Each entity is named and can reference other entities or formulas.
 * 
 * The construction engine resolves all entities to concrete coordinates
 * whenever measurements or variables change.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import { newId } from '../utils/ids';
import type {
  ConstructionState,
  CPoint,
  CLine,
  CCurve,
  CPiece,
  PieceNode,
  PointDefinition,
  CurveDefinition,
} from '../types/construction';

const initialState: ConstructionState = {
  points: [],
  lines: [],
  curves: [],
  pieces: [],
  variables: {},
  selectedEntity: null,
  showConstruction: true,
  pieceIdentityMap: {},
};

// ─── ID generator ───────────────────────────────────────────────────────────

// B11-state: thin wrapper. Prefix ignored. Previous `let _counter = 0`
// removed — verified non-load-bearing (no consumer sorts construction
// points/lines/curves by ID).
function cid(_prefix: string): string {
  return newId();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns true if the given point definition references a point by id or label. */
function referencesPoint(definition: PointDefinition, id: string, label: string): boolean {
  switch (definition.type) {
    case 'endLine':
      return definition.basePoint === id || definition.basePoint === label;
    case 'alongLine':
    case 'midpoint':
    case 'normal':
      return [definition.from, definition.to].some(ref => ref === id || ref === label);
    case 'intersectionXY':
      return [definition.xFrom, definition.yFrom].some(ref => ref === id || ref === label);
    case 'intersection':
      return [definition.line1Start, definition.line1End, definition.line2Start, definition.line2End]
        .some(ref => ref === id || ref === label);
    case 'absolute':
    case 'manual':
      return false;
    default:
      return false;
  }
}

// ─── Slice ──────────────────────────────────────────────────────────────────

const constructionSlice = createSlice({
  name: 'construction',
  initialState,
  reducers: {
    // ─── Points ───
    addPoint(state, action: PayloadAction<{ label: string; definition: PointDefinition; visible?: boolean; blockId?: string }>) {
      const { label, definition, visible, blockId } = action.payload;

      const lookup = (ref: string): { x: number; y: number } | null => {
        const pt = state.points.find(p => p.id === ref || p.label === ref);
        return pt ? { x: pt.x, y: pt.y } : null;
      };

      let x = 0, y = 0;
      let resolutionError: string | undefined;
      try {
        if (definition.type === 'absolute') {
          if (typeof definition.x === 'string' || typeof definition.y === 'string') {
            resolutionError = 'This point uses a formula that requires parametric resolution';
          } else {
            x = definition.x;
            y = definition.y;
          }
        } else if (definition.type === 'manual') {
          x = definition.x;
          y = definition.y;
        } else if (definition.type === 'endLine') {
          const base = lookup(definition.basePoint);
          if (!base) {
            resolutionError = `Dangling reference: point '${definition.basePoint}' not found`;
          } else {
            const angle = typeof definition.angle === 'number' ? definition.angle : 0;
            const length = typeof definition.length === 'number' ? definition.length : 0;
            const rad = (angle * Math.PI) / 180;
            x = base.x + length * Math.cos(rad);
            y = base.y - length * Math.sin(rad);
          }
        } else if (definition.type === 'alongLine') {
          const from = lookup(definition.from);
          const to = lookup(definition.to);
          const missing = [
            !from && `'${definition.from}'`,
            !to && `'${definition.to}'`,
          ].filter(Boolean);
          if (missing.length > 0) {
            resolutionError = `Dangling reference: point(s) ${missing.join(', ')} not found`;
          } else {
            const length = typeof definition.length === 'number' ? definition.length : 0;
            const totalDist = Math.sqrt((to!.x - from!.x) ** 2 + (to!.y - from!.y) ** 2);
            const ratio = totalDist > 0 ? length / totalDist : 0;
            x = from!.x + (to!.x - from!.x) * ratio;
            y = from!.y + (to!.y - from!.y) * ratio;
          }
        } else if (definition.type === 'midpoint') {
          const from = lookup(definition.from);
          const to = lookup(definition.to);
          const missing = [
            !from && `'${definition.from}'`,
            !to && `'${definition.to}'`,
          ].filter(Boolean);
          if (missing.length > 0) {
            resolutionError = `Dangling reference: point(s) ${missing.join(', ')} not found`;
          } else {
            x = (from!.x + to!.x) / 2;
            y = (from!.y + to!.y) / 2;
          }
        } else if (definition.type === 'intersectionXY') {
          const px = lookup(definition.xFrom);
          const py = lookup(definition.yFrom);
          const missing = [
            !px && `'${definition.xFrom}'`,
            !py && `'${definition.yFrom}'`,
          ].filter(Boolean);
          if (missing.length > 0) {
            resolutionError = `Dangling reference: point(s) ${missing.join(', ')} not found`;
          } else {
            x = px!.x;
            y = py!.y;
          }
        } else if (definition.type === 'normal') {
          const from = lookup(definition.from);
          const to = lookup(definition.to);
          const missing = [
            !from && `'${definition.from}'`,
            !to && `'${definition.to}'`,
          ].filter(Boolean);
          if (missing.length > 0) {
            resolutionError = `Dangling reference: point(s) ${missing.join(', ')} not found`;
          } else {
            const lineAngle = Math.atan2(to!.y - from!.y, to!.x - from!.x) * (180 / Math.PI);
            const normalAngle = lineAngle + (typeof definition.angle === 'number' ? definition.angle : 90);
            const length = typeof definition.length === 'number' ? definition.length : 0;
            const rad = (normalAngle * Math.PI) / 180;
            x = from!.x + length * Math.cos(rad);
            y = from!.y - length * Math.sin(rad);
          }
        } else if (definition.type === 'intersection') {
          const l1s = lookup(definition.line1Start);
          const l1e = lookup(definition.line1End);
          const l2s = lookup(definition.line2Start);
          const l2e = lookup(definition.line2End);
          const missing = [
            !l1s && `'${definition.line1Start}'`,
            !l1e && `'${definition.line1End}'`,
            !l2s && `'${definition.line2Start}'`,
            !l2e && `'${definition.line2End}'`,
          ].filter(Boolean);
          if (missing.length > 0) {
            resolutionError = `Dangling reference: point(s) ${missing.join(', ')} not found`;
          } else {
            const d1x = l1e!.x - l1s!.x, d1y = l1e!.y - l1s!.y;
            const d2x = l2e!.x - l2s!.x, d2y = l2e!.y - l2s!.y;
            const denom = d1x * d2y - d1y * d2x;
            if (Math.abs(denom) < 1e-10) {
              resolutionError = 'Lines are parallel — no intersection';
            } else {
              const t = ((l2s!.x - l1s!.x) * d2y - (l2s!.y - l1s!.y) * d2x) / denom;
              x = l1s!.x + t * d1x;
              y = l1s!.y + t * d1y;
            }
          }
        }
      } catch (err) {
        resolutionError = err instanceof Error ? err.message : 'Unknown resolution error';
      }

      state.points.push({
        id: cid('pt'),
        label,
        x, y,
        definition,
        visible: visible ?? true,
        blockId,
        resolutionError,
      });
    },

    updatePoint(state, action: PayloadAction<{ id: string; updates: Partial<Pick<CPoint, 'label' | 'x' | 'y' | 'definition' | 'visible'>> }>) {
      const point = state.points.find(p => p.id === action.payload.id);
      if (point) Object.assign(point, action.payload.updates);
    },

    removePoint(state, action: PayloadAction<string>) {
      const id = action.payload;
      const deletedPoint = state.points.find(p => p.id === id);
      const deletedLabel = deletedPoint?.label ?? id;

      state.points = state.points.filter(p => p.id !== id);

      // Flag dependents with resolutionError immediately
      for (const point of state.points) {
        if (referencesPoint(point.definition, id, deletedLabel)) {
          point.resolutionError = `Dangling reference: point '${deletedLabel}' was deleted`;
        }
      }

      // Remove lines/curves referencing this point
      state.lines = state.lines.filter(l => l.from !== id && l.to !== id);
      // Remove piece nodes referencing this point
      for (const piece of state.pieces) {
        piece.nodes = piece.nodes.filter(n => n.pointId !== id);
      }
    },

    // ─── Lines ───
    addLine(state, action: PayloadAction<{ label: string; from: string; to: string; style?: CLine['style'] }>) {
      const { label, from, to, style } = action.payload;
      state.lines.push({
        id: cid('ln'),
        label,
        from, to,
        style: style ?? 'construction',
        visible: true,
      });
    },

    removeLine(state, action: PayloadAction<string>) {
      state.lines = state.lines.filter(l => l.id !== action.payload);
    },

    // ─── Curves ───
    addCurve(state, action: PayloadAction<{ label: string; definition: CurveDefinition; blockId?: string }>) {
      state.curves.push({
        id: cid('cv'),
        label: action.payload.label,
        definition: action.payload.definition,
        visible: true,
        blockId: action.payload.blockId,
      });
    },

    removeCurve(state, action: PayloadAction<string>) {
      state.curves = state.curves.filter(c => c.id !== action.payload);
    },

    // ─── Pieces ───
    addConstructionPiece(state, action: PayloadAction<{ name: string; nodes: PieceNode[]; seamAllowance?: number; blockId?: string }>) {
      const { name, nodes, seamAllowance, blockId } = action.payload;
      state.pieces.push({
        id: cid('cp'),
        name,
        nodes,
        seamAllowance: seamAllowance ?? 10,
        closed: true,
        blockId,
      });
    },

    removeConstructionPiece(state, action: PayloadAction<string>) {
      state.pieces = state.pieces.filter(p => p.id !== action.payload);
    },

    addNodeToPiece(state, action: PayloadAction<{ pieceId: string; node: PieceNode }>) {
      const piece = state.pieces.find(p => p.id === action.payload.pieceId);
      if (piece) piece.nodes.push(action.payload.node);
    },

    // ─── Variables ───
    setVariable(state, action: PayloadAction<{ name: string; value: string | number }>) {
      state.variables[action.payload.name] = action.payload.value;
    },

    removeVariable(state, action: PayloadAction<string>) {
      delete state.variables[action.payload];
    },

    // ─── Bulk resolve — updates all point coordinates after measurement/variable change ───
    resolveAll(state, action: PayloadAction<{ resolved: Array<{ id: string; x: number; y: number; resolutionError?: string }> }>) {
      for (const { id, x, y, resolutionError } of action.payload.resolved) {
        const point = state.points.find(p => p.id === id);
        if (point) {
          point.x = x;
          point.y = y;
          point.resolutionError = resolutionError; // cleared to undefined on success
        }
      }
    },

    // ─── UI ───
    selectEntity(state, action: PayloadAction<ConstructionState['selectedEntity']>) {
      state.selectedEntity = action.payload;
    },

    toggleConstruction(state) {
      state.showConstruction = !state.showConstruction;
    },

    setShowConstruction(state, action: PayloadAction<boolean>) {
      state.showConstruction = action.payload;
    },

    // ─── Bulk load (for importing Seamly2D constructions) ───
    loadConstruction(state, action: PayloadAction<{
      points: CPoint[];
      lines: CLine[];
      curves: CCurve[];
      pieces: CPiece[];
      variables: Record<string, string | number>;
    }>) {
      state.points = action.payload.points;
      state.lines = action.payload.lines;
      state.curves = action.payload.curves;
      state.pieces = action.payload.pieces;
      state.variables = action.payload.variables;
    },

    clearConstruction(state) {
      state.points = [];
      state.lines = [];
      state.curves = [];
      state.pieces = [];
      state.variables = {};
      state.selectedEntity = null;
      state.pieceIdentityMap = {};
    },

    // ─── Piece Identity Mapping (for reactive solver) ───
    /**
     * Map a construction piece ID to a pattern piece ID.
     * This enables upsert behavior when rebuilding pieces.
     */
    mapPieceIdentity(state, action: PayloadAction<{ cPieceId: string; patternPieceId: string }>) {
      state.pieceIdentityMap[action.payload.cPieceId] = action.payload.patternPieceId;
    },

    /**
     * Remove a single piece identity mapping.
     */
    clearPieceIdentity(state, action: PayloadAction<string>) {
      delete state.pieceIdentityMap[action.payload];
    },

    /**
     * Clear all piece identity mappings.
     */
    clearAllIdentities(state) {
      state.pieceIdentityMap = {};
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
    builder.addMatcher(
      (action) => action.type === 'project/removePiece',
      (state, action) => {
        const pieceId = (action as unknown as { payload: string }).payload;
        for (const [cId, pId] of Object.entries(state.pieceIdentityMap)) {
          if (pId === pieceId) {
            delete state.pieceIdentityMap[cId];
          }
        }
        delete state.pieceIdentityMap[pieceId];
      },
    );
  },
});

export const {
  addPoint,
  updatePoint,
  removePoint,
  addLine,
  removeLine,
  addCurve,
  removeCurve,
  addConstructionPiece,
  removeConstructionPiece,
  addNodeToPiece,
  setVariable,
  removeVariable,
  resolveAll,
  selectEntity,
  toggleConstruction,
  setShowConstruction,
  loadConstruction,
  clearConstruction,
  // Piece identity mapping (for reactive solver)
  mapPieceIdentity,
  clearPieceIdentity,
  clearAllIdentities,
} = constructionSlice.actions;

export default constructionSlice.reducer;
