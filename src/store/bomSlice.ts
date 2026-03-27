import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { NEW_PROJECT } from './actions';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';
import type { BOMEntry, BOMEntryResolved, BOMCategory, BOMState } from '../types/bom';
import type { RootState } from './index';

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'openclo-bom';
const STORAGE_VERSION = 1;

interface PersistedEnvelope {
  version: number;
  data: BOMState;
}

/**
 * Write the current BOM state to localStorage as a versioned envelope.
 * Silently swallows errors (e.g. private browsing, storage full).
 */
export function persistBOM(state: BOMState): void {
  const envelope: PersistedEnvelope = { version: STORAGE_VERSION, data: state };
  safeSetItem(STORAGE_KEY, JSON.stringify(envelope));
}

/**
 * Read the BOM state from localStorage.
 * Returns null on missing key, parse errors, or version mismatches.
 */
export function loadBOM(): BOMState | null {
  try {
    const raw = safeGetItem(STORAGE_KEY);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as PersistedEnvelope;
    if (envelope.version !== STORAGE_VERSION || !envelope.data) return null;
    return envelope.data;
  } catch {
    return null;
  }
}

// ─── Initial State ───────────────────────────────────────────────────────────

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
      persistBOM(state as BOMState);
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
      persistBOM(state as BOMState);
    },

    updateEntry(
      state,
      action: PayloadAction<{ id: string; changes: Partial<BOMEntry> }>
    ) {
      const entry = state.entries.find(e => e.id === action.payload.id);
      if (!entry) return;
      Object.assign(entry, action.payload.changes);
      persistBOM(state as BOMState);
    },

    removeEntry(state, action: PayloadAction<string>) {
      state.entries = state.entries.filter(e => e.id !== action.payload);
      persistBOM(state as BOMState);
    },

    setCurrency(state, action: PayloadAction<string>) {
      state.currency = action.payload;
      persistBOM(state as BOMState);
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
      persistBOM(state as BOMState);
    },

    clearBOM(state) {
      state.entries = initialState.entries;
      state.currency = initialState.currency;
      state.lastExtractedAt = initialState.lastExtractedAt;
      state.extractedProjectVersion = initialState.extractedProjectVersion;
      persistBOM(state as BOMState);
    },

    rehydrateBOM(state, action: PayloadAction<BOMState>) {
      state.entries = action.payload.entries;
      state.currency = action.payload.currency;
      state.lastExtractedAt = action.payload.lastExtractedAt;
      state.extractedProjectVersion = action.payload.extractedProjectVersion;
    },
  },

  extraReducers: (builder) => {
    builder.addCase(NEW_PROJECT, (state) => {
      state.entries = initialState.entries;
      state.currency = initialState.currency;
      state.lastExtractedAt = initialState.lastExtractedAt;
      state.extractedProjectVersion = initialState.extractedProjectVersion;
      persistBOM(state as BOMState);
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
  rehydrateBOM,
} = bomSlice.actions;

// ─── Selectors ───────────────────────────────────────────────────────────────

/** All BOM entries. */
export function selectBOMEntries(state: RootState): BOMEntry[] {
  return state.bom.entries;
}

/** BOM entries filtered by category. */
export function selectBOMByCategory(state: RootState, category: BOMCategory): BOMEntry[] {
  return state.bom.entries.filter(e => e.category === category);
}

/** Sum of quantity * unitCost across all entries. */
export function selectTotalCost(state: RootState): number {
  return state.bom.entries.reduce((sum, e) => sum + e.quantity * e.unitCost, 0);
}

/** Sum of quantity * (override unitCost ?? base unitCost) for a given colorway. */
export function selectTotalCostByColorway(state: RootState, colorwayId: string): number {
  return state.bom.entries.reduce((sum, e) => {
    const override = e.colorwayOverrides[colorwayId];
    const cost = override?.unitCost ?? e.unitCost;
    return sum + e.quantity * cost;
  }, 0);
}

/**
 * Whether the BOM is stale relative to the current project.
 * True if extractedProjectVersion is null or differs from project.updatedAt.
 */
export function selectBOMIsStale(state: RootState): boolean {
  const { extractedProjectVersion } = state.bom;
  if (extractedProjectVersion == null) return true;
  const projectUpdatedAt = (state.project as unknown as Record<string, unknown>).updatedAt as number | undefined;
  return extractedProjectVersion !== projectUpdatedAt;
}

/** BOM entries with colorway overrides resolved into flat fields. */
export function selectBOMForColorway(state: RootState, colorwayId: string): BOMEntryResolved[] {
  return state.bom.entries.map(entry => {
    const override = entry.colorwayOverrides[colorwayId];
    const resolvedName = override?.name ?? entry.name;
    const resolvedUnitCost = override?.unitCost ?? entry.unitCost;
    return {
      ...entry,
      resolvedName,
      resolvedUnitCost,
      totalCost: entry.quantity * resolvedUnitCost,
    };
  });
}

export default bomSlice.reducer;
