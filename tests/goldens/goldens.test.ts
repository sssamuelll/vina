/**
 * Golden saved projects. Later i18n phases must prove that translating the
 * interface never changes what a project saves: the committed files below are
 * the reference, and each one must load and save back to itself.
 *
 * Regenerate with `GOLDENS_UPDATE=1 npx vitest run tests/goldens/goldens.test.ts`.
 * IDs come from crypto.randomUUID(), so a regenerated golden differs in IDs;
 * the round-trip tests only ever read IDs from the committed files.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, addTrazo, addTrim, loadProject } from '../../src/store/projectSlice';
import { importDXFContent } from '../../src/utils/dxf/importPipeline';
import { classifyImportedPieces } from '../../src/utils/geometricClassifier';
import { loadFromStorage, loadProjectFromJSON, saveProjectToJSON, saveToStorage } from '../../src/utils/projectIO';
import type { Trazo } from '../../src/types/types';
import type { Trim } from '../../src/types/trim';

// What saveToStorage hands to IndexedDB, and what loadFromStorage reads back.
const idb = vi.hoisted(() => ({ saved: undefined as unknown, toLoad: undefined as unknown }));
vi.mock('../../src/utils/storage', () => ({
  saveProject: async (p: unknown) => { idb.saved = p; },
  loadProject: async () => idb.toLoad ?? null,
  clearProject: async () => {},
}));

const FIXTURES = join(__dirname, '..', 'fixtures');
const GOLDENS = join(FIXTURES, 'goldens');
const NAMES = ['tshirt', 'tshirt-strokes', 'tshirt-trims'] as const;
type Name = (typeof NAMES)[number];

const makeStore = () => configureStore({ reducer: { project: projectReducer } });
const read = (file: string) => readFileSync(join(GOLDENS, file), 'utf-8');

/** The call sequence AppShell.importDXFFile runs after the file is parsed. */
function importTshirt(store: ReturnType<typeof makeStore>) {
  const content = readFileSync(join(FIXTURES, 'garments', 'tshirt_test.dxf'), 'utf-8');
  const { pieces } = importDXFContent(content, { unit: 'auto', autoDetect: true });
  classifyImportedPieces(pieces);
  for (const piece of pieces) store.dispatch(addPiece(piece));
}

function build(name: Name) {
  const store = makeStore();
  importTshirt(store);
  if (name === 'tshirt-strokes') {
    const trazo: Trazo = {
      id: crypto.randomUUID(),
      path: [{ type: 'M', values: [10, 10] }, { type: 'L', values: [90, 40] }],
      createdAt: Date.now(),
    };
    store.dispatch(addTrazo(trazo));
  }
  if (name === 'tshirt-trims') {
    const piece = store.getState().project.pieces[0];
    const edgeName = piece.edges?.[0]?.name;
    if (!edgeName) throw new Error('first piece has no named edge');
    const trim: Trim = {
      id: crypto.randomUUID(), pieceId: piece.id, type: 'button', name: 'Button', description: '',
      placement: { mode: 'edge-points', edgeName, positions: [0.5] },
      material: 'plastic', color: '#ffffff', size: 10, unitCost: 0, active: true,
    };
    store.dispatch(addTrim(trim));
  }
  return settle(store.getState().project);
}

/**
 * A fresh import is not a fixed point of load then save: loading backfills fields
 * (interfacingType, solidifyFactor, ...) and moves keys, and the second pass moves
 * them again. A golden is a project as the app saves it once it has settled, so
 * reload until the saved text stops changing.
 */
function settle(state: ReturnType<ReturnType<typeof makeStore>['getState']>['project']) {
  let current = state;
  let text = saveProjectToJSON(current);
  for (let pass = 0; pass < 4; pass++) {
    const parsed = loadProjectFromJSON(text);
    if (!parsed.ok) throw new Error(`built project does not parse: ${parsed.error.message}`);
    const store = makeStore();
    store.dispatch(loadProject(parsed.project));
    current = store.getState().project;
    const next = saveProjectToJSON(current);
    if (next === text) return current;
    text = next;
  }
  throw new Error('project does not settle under load then save');
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-20T00:00:00.000Z'), toFake: ['Date'] });
  idb.saved = undefined;
  idb.toLoad = undefined;
});
afterEach(() => vi.useRealTimers());

if (process.env.GOLDENS_UPDATE === '1') {
  describe('goldens update', () => {
    for (const name of NAMES) {
      it(`writes ${name}`, async () => {
        const state = build(name);
        if (state.trazos.length === 0 && name === 'tshirt-strokes') throw new Error('stroke not added');
        if (state.trims.length === 0 && name === 'tshirt-trims') throw new Error('trim not added');
        await saveToStorage(state);
        writeFileSync(join(GOLDENS, `${name}.vina.json`), saveProjectToJSON(state) + '\n');
        writeFileSync(join(GOLDENS, `${name}.idb.json`), JSON.stringify(idb.saved, null, 2) + '\n');
      });
    }
  });
}

describe('golden projects round-trip', () => {
  for (const name of NAMES) {
    it(`${name}.vina.json round-trips byte for byte`, () => {
      const file = read(`${name}.vina.json`);
      const parsed = loadProjectFromJSON(file);
      if (!parsed.ok) throw new Error(`golden does not parse: ${parsed.error.message}`);
      const store = makeStore();
      store.dispatch(loadProject(parsed.project));
      expect(saveProjectToJSON(store.getState().project) + '\n').toBe(file);
    });

    it(`${name}.idb.json loads and re-saves identically`, async () => {
      const record = JSON.parse(read(`${name}.idb.json`));
      idb.toLoad = record;
      const loaded = await loadFromStorage();
      if (!loaded || !loaded.ok) throw new Error('idb golden does not parse');
      const store = makeStore();
      store.dispatch(loadProject(loaded.project));
      await saveToStorage(store.getState().project);
      expect(JSON.parse(JSON.stringify(idb.saved))).toEqual(record);
    });
  }
});
