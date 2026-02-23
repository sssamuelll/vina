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
};

// ─── ID generator ───────────────────────────────────────────────────────────

let _counter = 0;
function cid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}

// ─── Slice ──────────────────────────────────────────────────────────────────

const constructionSlice = createSlice({
  name: 'construction',
  initialState,
  reducers: {
    // ─── Points ───
    addPoint(state, action: PayloadAction<{ label: string; definition: PointDefinition; visible?: boolean }>) {
      const { label, definition, visible } = action.payload;
      // Resolve immediately for absolute/manual types
      let x = 0, y = 0;
      if (definition.type === 'absolute') {
        x = typeof definition.x === 'number' ? definition.x : 0;
        y = typeof definition.y === 'number' ? definition.y : 0;
      } else if (definition.type === 'manual') {
        x = definition.x;
        y = definition.y;
      }
      // Other types need resolution pass — set to 0,0 initially
      state.points.push({
        id: cid('pt'),
        label,
        x, y,
        definition,
        visible: visible ?? true,
      });
    },

    updatePoint(state, action: PayloadAction<{ id: string; updates: Partial<Pick<CPoint, 'label' | 'x' | 'y' | 'definition' | 'visible'>> }>) {
      const point = state.points.find(p => p.id === action.payload.id);
      if (point) Object.assign(point, action.payload.updates);
    },

    removePoint(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.points = state.points.filter(p => p.id !== id);
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
    addCurve(state, action: PayloadAction<{ label: string; definition: CurveDefinition }>) {
      state.curves.push({
        id: cid('cv'),
        label: action.payload.label,
        definition: action.payload.definition,
        visible: true,
      });
    },

    removeCurve(state, action: PayloadAction<string>) {
      state.curves = state.curves.filter(c => c.id !== action.payload);
    },

    // ─── Pieces ───
    addConstructionPiece(state, action: PayloadAction<{ name: string; nodes: PieceNode[]; seamAllowance?: number }>) {
      const { name, nodes, seamAllowance } = action.payload;
      state.pieces.push({
        id: cid('cp'),
        name,
        nodes,
        seamAllowance: seamAllowance ?? 10,
        closed: true,
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
    resolveAll(state, action: PayloadAction<{ resolved: Array<{ id: string; x: number; y: number }> }>) {
      for (const { id, x, y } of action.payload.resolved) {
        const point = state.points.find(p => p.id === id);
        if (point) { point.x = x; point.y = y; }
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
    },
  },
  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, () => initialState);
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
} = constructionSlice.actions;

export default constructionSlice.reducer;
