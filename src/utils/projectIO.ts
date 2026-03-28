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
import { OpenCloProject } from '../types/types';
import { saveProject, loadProject as loadProjectFromIDB, clearProject } from './storage';

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

export function loadProjectFromJSON(json: string): OpenCloProject {
  const raw = JSON.parse(json);
  return deserializeDates(raw) as OpenCloProject;
}

// ─── IndexedDB Autosave (async) ─────────────────────────────────────────────

/** Save project to IndexedDB (debounced by caller). */
export async function saveToStorage(state: ProjectState): Promise<void> {
  const project = serializeDates(stateToProject(state));
  await saveProject(project);
}

/** Load project from IndexedDB (with automatic localStorage migration). */
export async function loadFromStorage(): Promise<OpenCloProject | null> {
  const raw = await loadProjectFromIDB();
  if (!raw) return null;
  try {
    return deserializeDates(raw) as OpenCloProject;
  } catch {
    return null;
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
export function loadFromLocalStorage(): OpenCloProject | null {
  // Sync fallback: check localStorage directly (migration happens on async load)
  try {
    const json = localStorage.getItem('openclo-autosave');
    if (!json) return null;
    return loadProjectFromJSON(json);
  } catch {
    return null;
  }
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
  a.download = (filename || state.name || 'project') + '.openclo';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function uploadProjectFile(): Promise<OpenCloProject> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.openclo,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error('No file selected')); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const project = loadProjectFromJSON(reader.result as string);
          resolve(project);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}
