import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import type { BOMEntry, BOMEntryResolved, BOMCategory, BOMState } from '../types/bom';
import type { RootState } from './index';

// ─── Initial State ───────────────────────────────────────────────────────────
// BOM is project-scoped derived data — not persisted to localStorage.
// Re-extract on demand via "Refresh BOM". This avoids cross-project
// contamination that would occur with a single-key localStorage approach.

const initialState: BOMState = {
  entries: [],
  currency: 'USD',
  lastExtractedAt: null,
  extractedProjectVersion: null,
};

// ─── Slice ───────────────────────────────────────────────────────────────────

const bomSlice = createSlice({
  name: 'bom',
  initialState,
  reducers: {
    populateBOM(
      state,
      action: PayloadAction<{ entries: BOMEntry[]; projectVersion: number }>
    ) {
      // Keep manual entries, replace auto-populated ones
      const manualEntries = state.entries.filter(e => !e.autoPopulated);
      state.entries = [...manualEntries, ...action.payload.entries];
      state.lastExtractedAt = Date.now();
      state.extractedProjectVersion = action.payload.projectVersion;

    },

    addManualEntry(
      state,
      action: PayloadAction<Omit<BOMEntry, 'id' | 'autoPopulated'>>
    ) {
      const entry: BOMEntry = {
        ...action.payload,
        id: crypto.randomUUID(),
        autoPopulated: false,
      };
      state.entries.push(entry);

    },

    updateEntry(
      state,
      action: PayloadAction<{ id: string; changes: Partial<BOMEntry> }>
    ) {
      const entry = state.entries.find(e => e.id === action.payload.id);
      if (!entry) return;
      Object.assign(entry, action.payload.changes);

    },

    removeEntry(state, action: PayloadAction<string>) {
      state.entries = state.entries.filter(e => e.id !== action.payload);

    },

    setCurrency(state, action: PayloadAction<string>) {
      state.currency = action.payload;

    },

    setColorwayOverride(
      state,
      action: PayloadAction<{
        entryId: string;
        colorwayId: string;
        override: { name?: string; unitCost?: number };
      }>
    ) {
      const entry = state.entries.find(e => e.id === action.payload.entryId);
      if (!entry) return;
      entry.colorwayOverrides[action.payload.colorwayId] = action.payload.override;

    },

    clearBOM(state) {
      state.entries = initialState.entries;
      state.currency = initialState.currency;
      state.lastExtractedAt = initialState.lastExtractedAt;
      state.extractedProjectVersion = initialState.extractedProjectVersion;

    },

  },

  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, (state) => {
      state.entries = initialState.entries;
      state.currency = initialState.currency;
      state.lastExtractedAt = initialState.lastExtractedAt;
      state.extractedProjectVersion = initialState.extractedProjectVersion;

    });
  },
});

export const {
  populateBOM,
  addManualEntry,
  updateEntry,
  removeEntry,
  setCurrency,
  setColorwayOverride,
  clearBOM,
} = bomSlice.actions;

// ─── Selectors ───────────────────────────────────────────────────────────────
// Pattern follows src/store/selectors.ts (introduced 2026-03-05): plain root
// selectors, memoized derivations via createSelector. Memoization preserves
// reference identity across calls when inputs are unchanged, preventing
// useSelector re-renders for consumers that subscribe to derived arrays.
//
// Parameterized selectors (selectBOMByCategory, selectTotalCostByColorway,
// selectBOMForColorway) use the "arg as input selector" pattern: the second
// argument flows through an input selector, default lruMemoize keeps cache
// size 1. Sufficient for current usage (one consumer, one arg value at a
// time). Factory-per-component and weakMapMemoize were considered and
// rejected as overkill — see docs/reports/2026-04-29-drift-fase2-b4state-selectors.md.

/** All BOM entries. Plain root selector — Immer keeps reference stable across non-mutating updates. */
export const selectBOMEntries = (state: RootState): BOMEntry[] => state.bom.entries;

/** BOM entries filtered by category. */
export const selectBOMByCategory = createSelector(
  [selectBOMEntries, (_state: RootState, category: BOMCategory) => category],
  (entries, category): BOMEntry[] => entries.filter(e => e.category === category),
);

/** Sum of quantity * unitCost across all entries. */
export const selectTotalCost = createSelector(
  [selectBOMEntries],
  (entries): number => entries.reduce((sum, e) => sum + e.quantity * e.unitCost, 0),
);

/** Sum of quantity * (override unitCost ?? base unitCost) for a given colorway. */
export const selectTotalCostByColorway = createSelector(
  [selectBOMEntries, (_state: RootState, colorwayId: string) => colorwayId],
  (entries, colorwayId): number =>
    entries.reduce((sum, e) => {
      const override = e.colorwayOverrides[colorwayId];
      const cost = override?.unitCost ?? e.unitCost;
      return sum + e.quantity * cost;
    }, 0),
);

/**
 * Whether the BOM is stale relative to the current project.
 * True if extractedProjectVersion is null or differs from project.updatedAt.
 */
export const selectBOMIsStale = createSelector(
  [(state: RootState) => state.bom.extractedProjectVersion,
   (state: RootState) => (state.project as unknown as Record<string, unknown>).updatedAt as number | undefined],
  (extractedProjectVersion, projectUpdatedAt): boolean => {
    if (extractedProjectVersion == null) return true;
    return extractedProjectVersion !== projectUpdatedAt;
  },
);

/** BOM entries with colorway overrides resolved into flat fields. */
export const selectBOMForColorway = createSelector(
  [selectBOMEntries, (_state: RootState, colorwayId: string) => colorwayId],
  (entries, colorwayId): BOMEntryResolved[] =>
    entries.map(entry => {
      const override = entry.colorwayOverrides[colorwayId];
      const resolvedName = override?.name ?? entry.name;
      const resolvedUnitCost = override?.unitCost ?? entry.unitCost;
      return {
        ...entry,
        resolvedName,
        resolvedUnitCost,
        totalCost: entry.quantity * resolvedUnitCost,
      };
    }),
);

export default bomSlice.reducer;
