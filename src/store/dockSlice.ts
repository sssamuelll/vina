import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';

type DockSide = 'left' | 'right';

export interface DockState {
  /** Auto-suggestion ids the user kept (shown always, with a 📌 badge). */
  pinnedExtra: { left: string[]; right: string[] };
  /** Auto-signaling preference. 'off' mutes ✦ suggestions + badges + the "auto"
   *  label; kept items still render as plain buttons. Default 'subtle'. */
  signaling: 'subtle' | 'off';
  /** The left (2D) dock's tool membership — ids drawn from DOCK_2D_CATALOG.
   *  Rendered in this array's order (user-reorderable via drag, slice 4b).
   *  Default DEFAULT_DOCK_2D_IDS. Min 1 (never empty). */
  tools2d: string[];
}

const STORAGE_KEY = 'vina-docks';
const STORAGE_VERSION = 1;
const MAX_PINNED = 16;

/**
 * Tope de herramientas del dock 2D.
 *
 * NO es el mismo botón que `MAX_PINNED`, aunque los dos sean números parecidos:
 * `MAX_PINNED` acota las sugerencias que la usuaria se queda (`pinnedExtra`), y
 * esto acota `tools2d`, cuyos ids salen todos de `DOCK_2D_CATALOG`.
 *
 * Por qué existe: el sobre persistido valida `.max()` sobre esta lista, y zod
 * rechaza el sobre ENTERO cuando un campo no valida — `loadDocks` devuelve null
 * y el dock vuelve a las doce de fábrica. O sea que pasarse del tope no recorta
 * la lista: le borra a María TODA su configuración, sin avisar. Con catorce en
 * el catálogo el tope era inalcanzable; con veintiuna no.
 *
 * Por qué 21 y no 16: tiene que caber el catálogo COMPLETO. Un tope por debajo
 * cambia el desastre por un defecto más pequeño pero igual de mudo — el botón
 * «añadir» de las últimas del personalizador no haría nada. Si el catálogo
 * crece por encima de esto, hay que subirlo: lo pide un aserto de
 * `las-siete-puertas-que-se-abren.test.ts`.
 */
export const MAX_DOCK_2D_TOOLS = 21;
const MAX_ID_LEN = 80;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Historical seven-tool default. Kept only for exact migration matching. */
export const LEGACY_DEFAULT_DOCK_2D_IDS = [
  'select', 'pen', 'line', 'rectangle', 'scissors', 'measure', 'seam',
] as const;

/** Pre-`point` eight-tool default. Kept only for exact migration matching. */
export const LEGACY_DEFAULT_DOCK_2D_IDS_V2 = [
  'select', 'editPattern', 'pen', 'line',
  'rectangle', 'scissors', 'measure', 'seam',
] as const;

/** Default de nueve, previo a partir coser en crear/editar (#1028). */
export const LEGACY_DEFAULT_DOCK_2D_IDS_V3 = [
  'select', 'editPattern', 'point', 'pen', 'line',
  'rectangle', 'scissors', 'measure', 'seam',
] as const;

/** Default de diez, previo a darle puerta a piquete y margen (auditoría de UI
 *  2026-08-14). Se conserva solo para el emparejado exacto de la migración. */
export const LEGACY_DEFAULT_DOCK_2D_IDS_V4 = [
  'select', 'editPattern', 'point', 'pen', 'line',
  'rectangle', 'scissors', 'measure', 'seam', 'seamEdit',
] as const;

/** Default de doce, previo a retirar `line` en la unificación de líneas
 *  internas (spec 2026-08-29). Se conserva solo para el emparejado exacto de
 *  la migración. */
export const LEGACY_DEFAULT_DOCK_2D_IDS_V5 = [
  'select', 'editPattern', 'point', 'pen', 'line',
  'rectangle', 'scissors', 'measure', 'seam', 'seamEdit',
  'seamAllowance', 'notch',
] as const;

/** Current default left-dock 2D tool ids, in render order. `point` entre
 *  editar y pluma: es hermano de editar, no de dibujar (maria-203).
 *  `seamEdit` justo detrás de `seam`: son las dos mitades del menú coser de
 *  CLO3D y María las busca juntas (#219).
 *
 *  `seamAllowance` y `notch` cierran el grupo de costura: son las herramientas
 *  de #1027 y #1029 y hasta la auditoría del 2026-08-14 NO tenían puerta —
 *  para llegar a piquete había que abrir el personalizador del dock y
 *  agregarla a mano. Ley de puertas (§ 5.6): una función que se despacha tiene
 *  entrada visible en el shell. Lo fija dock2dTools.puertas.test.ts.
 *
 *  `internalShape` en la ranura de `line`: `line` murió en la unificación de
 *  líneas internas (spec 2026-08-29). */
export const DEFAULT_DOCK_2D_IDS = [
  'select', 'editPattern', 'point', 'pen', 'internalShape',
  'rectangle', 'scissors', 'measure', 'seam', 'seamEdit',
  'seamAllowance', 'notch',
] as const;

/** Un set persistido que sea EXACTAMENTE un default histórico migra al default
 *  vigente; cualquier set personalizado se respeta byte a byte, salvo que
 *  `line` retirado se remapea a `internalShape` en cualquier posición. */
export function migrateDefaultDockTools(ids: readonly string[]): string[] {
  const matches = (def: readonly string[]) =>
    ids.length === def.length && ids.every((id, index) => id === def[index]);
  if (
    matches(LEGACY_DEFAULT_DOCK_2D_IDS) ||
    matches(LEGACY_DEFAULT_DOCK_2D_IDS_V2) ||
    matches(LEGACY_DEFAULT_DOCK_2D_IDS_V3) ||
    matches(LEGACY_DEFAULT_DOCK_2D_IDS_V4) ||
    matches(LEGACY_DEFAULT_DOCK_2D_IDS_V5)
  ) {
    return [...DEFAULT_DOCK_2D_IDS];
  }
  // 'line' murió en la unificación de líneas internas (spec 2026-08-29): su
  // ranura la hereda internalShape, sin duplicar si ya estaba.
  const out: string[] = [];
  for (const id of ids) {
    const mapped = id === 'line' ? 'internalShape' : id;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

const idString = z
  .string()
  .min(1)
  .max(MAX_ID_LEN)
  .refine((s) => !s.includes('\0'), { message: 'contains null byte' });
const sideArray = z.array(idString).max(MAX_PINNED);

const signalingSchema = z.enum(['subtle', 'off']).default('subtle');

const tools2dSchema = z.array(idString).max(MAX_DOCK_2D_TOOLS).default([...DEFAULT_DOCK_2D_IDS]);

const DockStateSchema = z
  .object({
    pinnedExtra: z.object({ left: sideArray, right: sideArray }).strict(),
    signaling: signalingSchema,
    tools2d: tools2dSchema,
  })
  .strict();

const PersistedEnvelopeSchema = z
  .object({ version: z.literal(STORAGE_VERSION), data: DockStateSchema })
  .strict();

const initialState: DockState = { pinnedExtra: { left: [], right: [] }, signaling: 'subtle', tools2d: [...DEFAULT_DOCK_2D_IDS] };

/** Persist the kept-dock set to its own LS key (small per-user UI preference;
 *  LS-only, co-located in spirit with workflowSlice prefs — not project data). */
export function persistDocks(state: DockState): void {
  safeSetItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, data: state }));
}

export function loadDocks(): DockState | null {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw, (key, value) => {
      if (FORBIDDEN_KEYS.has(key)) throw new Error('forbidden key');
      return value;
    });
  } catch {
    return null;
  }
  const result = PersistedEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('[dockSlice] discarding corrupt envelope', {
      issues: result.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), code: i.code })),
    });
    return null;
  }
  const data = result.data.data;
  return { ...data, tools2d: migrateDefaultDockTools(data.tools2d) };
}

const dockSlice = createSlice({
  name: 'dock',
  initialState,
  reducers: {
    pinAuto(state, action: PayloadAction<{ side: DockSide; id: string }>) {
      const { side, id } = action.payload;
      if (!state.pinnedExtra[side].includes(id)) state.pinnedExtra[side].push(id);
    },
    unpinAuto(state, action: PayloadAction<{ side: DockSide; id: string }>) {
      const { side, id } = action.payload;
      state.pinnedExtra[side] = state.pinnedExtra[side].filter((x) => x !== id);
    },
    toggleDockSignaling(state) {
      state.signaling = state.signaling === 'subtle' ? 'off' : 'subtle';
    },
    rehydrateDocks(state, action: PayloadAction<DockState>) {
      state.pinnedExtra = action.payload.pinnedExtra;
      state.signaling = action.payload.signaling;
      state.tools2d = action.payload.tools2d;
    },
    addDockTool(state, action: PayloadAction<string>) {
      // El tope se comprueba AQUÍ y no solo en el schema: pasarse no recorta la
      // lista al recargar, la tira entera (ver MAX_DOCK_2D_TOOLS). Callarse una
      // herramienta de más es mucho más barato que devolverle el dock de
      // fábrica a quien lleva meses acomodándolo.
      if (state.tools2d.length >= MAX_DOCK_2D_TOOLS) return;
      if (!state.tools2d.includes(action.payload)) state.tools2d.push(action.payload);
    },
    removeDockTool(state, action: PayloadAction<string>) {
      if (state.tools2d.length <= 1) return; // never empty the dock
      state.tools2d = state.tools2d.filter((id) => id !== action.payload);
    },
    resetDockTools(state) {
      state.tools2d = [...DEFAULT_DOCK_2D_IDS];
    },
    reorderDockTool(state, action: PayloadAction<{ fromId: string; toId: string }>) {
      const { fromId, toId } = action.payload;
      if (fromId === toId) return;
      const from = state.tools2d.indexOf(fromId);
      const to = state.tools2d.indexOf(toId);
      if (from === -1 || to === -1) return; // unknown id → no-op
      state.tools2d.splice(from, 1);
      const insertAt = state.tools2d.indexOf(toId); // recompute after removal
      state.tools2d.splice(insertAt, 0, fromId);
    },
  },
  // No new-project handler: the kept set is a user preference and persists across projects.
});

export const { pinAuto, unpinAuto, rehydrateDocks, toggleDockSignaling, addDockTool, removeDockTool, resetDockTools, reorderDockTool } = dockSlice.actions;
export default dockSlice.reducer;
