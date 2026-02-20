import { OpenCloProject } from '../types/types';

const LOCAL_STORAGE_KEY = 'openclo-autosave';

interface ProjectState {
  id: string;
  name: string;
  pieces: any[];
  seams: any[];
  fabrics: any[];
  avatar: any;
  avatarMode?: string;
  avatarModelUrl?: string | null;
  isDirty?: boolean;
}

function serializeDates(obj: any): any {
  if (obj instanceof Date) return { __date__: obj.toISOString() };
  if (Array.isArray(obj)) return obj.map(serializeDates);
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = serializeDates(obj[key]);
    }
    return result;
  }
  return obj;
}

function deserializeDates(obj: any): any {
  if (Array.isArray(obj)) return obj.map(deserializeDates);
  if (obj && typeof obj === 'object') {
    if (obj.__date__) return new Date(obj.__date__).getTime();
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = deserializeDates(obj[key]);
    }
    return result;
  }
  return obj;
}

export function saveProjectToJSON(state: ProjectState): string {
  const project = {
    id: state.id,
    name: state.name,
    pieces: state.pieces,
    seams: state.seams,
    fabrics: state.fabrics,
    avatar: state.avatar,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return JSON.stringify(serializeDates(project), null, 2);
}

export function loadProjectFromJSON(json: string): OpenCloProject {
  const raw = JSON.parse(json);
  return deserializeDates(raw) as OpenCloProject;
}

export function saveToLocalStorage(state: ProjectState): void {
  try {
    const json = saveProjectToJSON(state);
    localStorage.setItem(LOCAL_STORAGE_KEY, json);
  } catch {
    // silently fail (quota exceeded, etc.)
  }
}

export function loadFromLocalStorage(): OpenCloProject | null {
  try {
    const json = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!json) return null;
    return loadProjectFromJSON(json);
  } catch {
    return null;
  }
}

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
