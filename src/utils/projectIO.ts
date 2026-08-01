/**
 * Project I/O — save/load/export/import with IndexedDB persistence.
 *
 * Uses `storage.ts` abstraction (IndexedDB primary, localStorage fallback).
 * Legacy localStorage autosave is auto-migrated on first load.
 *
 * @module projectIO
 */

import type { PieceGroup, ReferenceImage } from '../types/types';
import type { Trim } from '../types/trim';
import { saveProject, loadProject as loadProjectFromIDB, clearProject } from './storage';
import { parseVinaProject } from './projectSchema';
import type { ProjectParseResult, ParseError } from './projectSchema';

export type { ProjectParseResult, ParseError } from './projectSchema';

interface ProjectState {
  id: string;
  name: string;
  pieces: unknown[];
  seams: unknown[];
  fabrics: unknown[];
  avatar: unknown;
  avatarMode?: string;
  avatarModelUrl?: string | null;
  isDirty?: boolean;
  groups?: PieceGroup[];
  garmentInfo?: import('../types/types').GarmentInfo;
  referenceImages?: ReferenceImage[];
  trims?: Trim[];
}

// ─── Serialization ──────────────────────────────────────────────────────────

function serializeDates(obj: unknown): unknown {
  if (obj instanceof Date) return { __date__: obj.toISOString() };
  if (Array.isArray(obj)) return obj.map(serializeDates);
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      result[key] = serializeDates((obj as Record<string, unknown>)[key]);
    }
    return result;
  }
  return obj;
}

function deserializeDates(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(deserializeDates);
  if (obj && typeof obj === 'object') {
    const rec = obj as Record<string, unknown>;
    if (rec.__date__) return new Date(rec.__date__ as string).getTime();
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(rec)) {
      // A crafted .openclo can carry an own "__proto__" key (JSON.parse keeps it);
      // bracket-assigning it invokes the prototype setter. Skip it — legit project
      // data never uses these keys. (Security study #12, hygiene.)
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      result[key] = deserializeDates(rec[key]);
    }
    return result;
  }
  return obj;
}

function stateToProject(state: ProjectState): Record<string, unknown> {
  return {
    id: state.id,
    name: state.name,
    pieces: state.pieces,
    seams: state.seams,
    fabrics: state.fabrics,
    avatar: state.avatar,
    groups: state.groups ?? [],
    garmentInfo: state.garmentInfo || {},
    referenceImages: state.referenceImages ?? [],
    trims: state.trims ?? [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── JSON Export/Import ─────────────────────────────────────────────────────

export function saveProjectToJSON(state: ProjectState): string {
  return JSON.stringify(serializeDates(stateToProject(state)), null, 2);
}

/**
 * Parse a JSON project payload. Returns a Result; never throws.
 *
 * This is the file-format boundary: callers receive `{ ok: true, project, warnings }`
 * or `{ ok: false, error }` and decide how to react. The parser rejects
 * structurally invalid payloads before they reach Redux.
 */
export function loadProjectFromJSON(json: string): ProjectParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return {
      ok: false,
      error: { code: 'invalid_json', message: e instanceof Error ? e.message : 'invalid JSON' },
    };
  }
  return parseVinaProject(deserializeDates(raw));
}

// ─── IndexedDB Autosave (async) ─────────────────────────────────────────────

/** Save project to IndexedDB (debounced by caller). */
export async function saveToStorage(state: ProjectState): Promise<void> {
  const project = serializeDates(stateToProject(state));
  await saveProject(project);
}

/**
 * Load project from IndexedDB (with automatic localStorage migration).
 *
 * Returns:
 * - `null` if no autosave exists.
 * - `ProjectParseResult` for any payload that was found. Callers MUST handle
 *   `ok: false` (e.g. by quarantining the corrupt blob) — silently treating
 *   it as "no project" would re-overwrite the autosave on next save and lose
 *   the user's work.
 */
export async function loadFromStorage(): Promise<ProjectParseResult | null> {
  const raw = await loadProjectFromIDB();
  if (!raw) return null;
  const result = parseVinaProject(deserializeDates(raw));
  if (!result.ok) quarantineCorruptAutosave(raw, result.error);
  return result;
}

const QUARANTINE_KEY_PREFIX = 'vina-autosave-quarantine-';
// Cap the per-quarantine entry to ~5MB so we never fill localStorage with one blob.
const MAX_QUARANTINE_BYTES = 5_000_000;

/**
 * Preserve a corrupt autosave blob under a timestamped localStorage key
 * before the running app overwrites it with a fresh autosave. Without this,
 * a once-corrupt IDB row gets silently replaced 30s after launch and the
 * user loses any data they had.
 */
function quarantineCorruptAutosave(raw: unknown, error: ParseError): void {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `${QUARANTINE_KEY_PREFIX}${ts}`;
    let payload: string;
    try {
      payload = JSON.stringify({ error, raw });
    } catch {
      payload = JSON.stringify({ error, note: 'raw payload not JSON-serializable' });
    }
    if (payload.length > MAX_QUARANTINE_BYTES) {
      payload = JSON.stringify({ error, note: 'raw payload truncated', size: payload.length });
    }
    localStorage.setItem(key, payload);
  } catch {
    // localStorage may be unavailable (Safari private mode, quota exceeded);
    // we already lost the chance to recover but parse error is logged by caller.
  }
}

/** Clear the autosave from IndexedDB + legacy localStorage. */
export async function clearStorageProject(): Promise<void> {
  await clearProject();
}

// ─── Legacy Sync API (deprecated, kept for backward compat during migration) ──

/** @deprecated Use saveToStorage() instead */
export function saveToLocalStorage(state: ProjectState): void {
  // Now delegates to async — fire and forget
  saveToStorage(state).catch(() => {});
}

/** @deprecated Use loadFromStorage() instead */
export function loadFromLocalStorage(): ProjectParseResult | null {
  // Sync fallback: check localStorage directly (migration happens on async load)
  let json: string | null;
  try {
    json = localStorage.getItem('openclo-autosave');
  } catch {
    return null;
  }
  if (!json) return null;
  return loadProjectFromJSON(json);
}

/** @deprecated Use clearStorageProject() instead */
export function clearLocalStorageProject(): void {
  clearStorageProject().catch(() => {});
}

// ─── File Download/Upload ───────────────────────────────────────────────────

export function downloadProjectFile(state: ProjectState, filename?: string): void {
  const json = saveProjectToJSON(state);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (filename || state.name || 'project') + '.vina';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function uploadProjectFile(): Promise<ProjectParseResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    // '.openclo' legacy: se abre para siempre, solo cambió lo que se escribe
    input.accept = '.vina,.openclo,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error('No file selected')); return; }
      const reader = new FileReader();
      reader.onload = () => {
        resolve(loadProjectFromJSON(reader.result as string));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}
