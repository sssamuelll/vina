// @vitest-environment jsdom
/**
 * Sustitución automatizada del round-trip manual de la tanda 2c.
 *
 * `projectAutosave` guarda el slice mediante projectIO en el slot canónico
 * projects/autosave. Ese slot contiene `VinaProject` v1 sin envelope; la
 * validación zod ocurre al releerlo, no al escribirlo.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { PatternPiece, VinaProject } from '../../types/types';
import { loadFromStorage } from '../projectIO';
import { storageDel, storageGet, storageSet } from '../storage';

const span = { tStart: 0.25, tEnd: 0.75, width: 18.5 };

const piece: PatternPiece = {
  id: 'piece-with-span',
  name: 'Pieza con tramo',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 10,
  edges: [{
    id: 'piece-with-span:top',
    name: 'top',
    segmentRange: [1, 2],
    edgeType: 'seam',
    length: 200,
    seamAllowanceSpans: [span],
  }],
  active: true,
  createdAt: 1_000,
  updatedAt: 1_000,
};

const project: VinaProject = {
  id: 'project-span-round-trip',
  name: 'Persistencia del tramo',
  pieces: [piece],
  seams: [],
  fabrics: [{
    id: 'fabric-1',
    name: 'Cotton',
    color: '#ffffff',
    weight: 150,
    stretch: 0.1,
    stiffness: 0.3,
    friction: 0.5,
  }],
  avatar: {
    id: 'avatar-1',
    name: 'Default',
    modelUrl: '/models/avatar.glb',
    measurements: {
      height: 170,
      chest: 90,
      waist: 72,
      hips: 96,
      shoulder: 40,
      armLength: 60,
      inseam: 80,
    },
  },
  createdAt: 1_000,
  updatedAt: 1_000,
};

afterEach(async () => {
  await storageDel('projects', 'autosave');
});

describe('persistencia del proyecto con seamAllowanceSpans', () => {
  it('conserva los tres números al guardar y recargar el autosave real', async () => {
    await storageSet('projects', 'autosave', project); // shape: VinaProject v1 — opt-in envelope: no

    const raw = await storageGet<VinaProject>('projects', 'autosave');
    expect(raw?.pieces[0].edges?.[0].seamAllowanceSpans?.[0]).toEqual(span);

    // La recarga real añade el parse zod que usa `initProjectPersistence`;
    // comprobar solo el blob de IDB no detectaría un campo descartado allí.
    const reloaded = await loadFromStorage();
    expect(reloaded?.ok).toBe(true);
    if (!reloaded?.ok) throw new Error('el autosave válido no pudo recargarse');
    expect(reloaded.project.pieces[0].edges?.[0].seamAllowanceSpans?.[0]).toEqual(span);
  });
});
