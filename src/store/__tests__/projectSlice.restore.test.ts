/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * restoreProject — the FAITHFUL load path (boot autosave restore).
 *
 * loadProject is an IMPORT pipeline: validate + repair + backfill PLUS
 * generative enrichment (auto-rename duplicates, auto-sew). Restoring an
 * autosave must return exactly what the user had saved — phantom seams the
 * user never made appeared on reload before this split (found live: a DXF
 * project saved with 0 seams restored with auto-sewn 22-89% mismatch seams).
 */
import { describe, it, expect } from 'vitest';
import reducer, { restoreProject, loadProject } from '../projectSlice';
import type { VinaProject } from '../../types/types';

const initial = reducer(undefined, { type: '@@INIT' });

function makePiece(id: string, name: string): any {
  return {
    id,
    name,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    layer: 1,
    sublayer: 0,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

function makeProject(overrides: Partial<VinaProject> = {}): VinaProject {
  return {
    id: 'proj-1',
    name: 'Saved work',
    pieces: [makePiece('p1', 'Front'), makePiece('p2', 'Front')], // duplicate names on purpose
    seams: [],
    fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  } as VinaProject;
}

describe('projectSlice — restoreProject (faithful restore)', () => {
  it('preserves duplicate piece names verbatim (no auto-rename)', () => {
    const next = reducer(initial, restoreProject(makeProject()));
    expect(next.pieces.map(p => p.name)).toEqual(['Front', 'Front']);
  });

  it('loadProject (import pipeline) DOES rename duplicates — the generative contrast', () => {
    const next = reducer(initial, loadProject(makeProject()));
    const names = next.pieces.map(p => p.name);
    expect(new Set(names).size).toBe(2); // renamed apart
    expect(names).not.toEqual(['Front', 'Front']);
  });

  it('never invents seams: a project saved with 0 seams restores with 0 seams', () => {
    const next = reducer(initial, restoreProject(makeProject()));
    expect(next.seams).toEqual([]);
    expect(next.loadDiagnostics.some(d => d.code === 'AUTO_SEAMS_DETECTED')).toBe(false);
  });

  it('restores saved seams exactly and backfills legacy seam fields', () => {
    const seam: any = {
      id: 's1',
      pieceA: { pieceId: 'p1', edgeName: 'sideSeam' },
      pieceB: { pieceId: 'p2', edgeName: 'sideSeam' },
      type: 'standard',
      // tension/strength/active/taped/tapeWidth intentionally absent (legacy blob)
    };
    const next = reducer(initial, restoreProject(makeProject({ seams: [seam] })));
    expect(next.seams).toHaveLength(1);
    expect(next.seams[0].id).toBe('s1');
    expect(next.seams[0].tension).toBe(100); // backfill still applies on restore
    expect(next.seams[0].active).toBe(true);
  });

  it('still validates/repairs and backfills piece metadata', () => {
    const legacyPiece: any = { ...makePiece('p1', 'Solo') };
    delete legacyPiece.layer;
    delete legacyPiece.sublayer;
    delete legacyPiece.active;
    const next = reducer(initial, restoreProject(makeProject({ pieces: [legacyPiece] })));
    expect(next.pieces[0].layer).toBeDefined();
    expect(next.pieces[0].sublayer).toBe(0);
    expect(next.pieces[0].active).toBe(true);
  });

  it('marks the restored project clean (isDirty=false)', () => {
    const dirty = { ...initial, isDirty: true };
    const next = reducer(dirty as any, restoreProject(makeProject()));
    expect(next.isDirty).toBe(false);
  });
});
