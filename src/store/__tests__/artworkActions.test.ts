/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, {
  addArtwork, updateArtwork, removeArtwork,
} from '../projectSlice';
import type { PieceArtwork } from '../../types/artwork';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePiece(id: string, edges: { name: string }[] = []) {
  return {
    id,
    name: id,
    outline: [],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    active: true,
    edges,
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeArtwork(id: string, overrides: Partial<PieceArtwork> = {}): PieceArtwork {
  return {
    id,
    imageId: `blob-${id}`,
    filename: `${id}.png`,
    position: { x: 0, y: 0 },
    width: 50,
    height: 50,
    rotation: 0,
    opacity: 1,
    ...overrides,
  };
}

function baseState(overrides: Record<string, any> = {}) {
  return {
    id: 'test', name: 'Test', pieces: [] as any[], seams: [], pleats: [], elastics: [], trims: [],
    fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
    avatarMode: 'model' as const, avatarModelUrl: null, isDirty: false,
    arrangementOverrides: {}, groups: [], seamGroups: [], poms: [],
    referenceImages: [],
    trazos: [],
    layerNames: {}, layerLocked: {},
    loadDiagnostics: [],
    loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
    colorways: [],
    activeColorwayId: null,
    ...overrides,
  };
}

// ─── addArtwork ─────────────────────────────────────────────────────────────

describe('projectSlice — Artwork CRUD', () => {
  it('addArtwork success', () => {
    const state = baseState({ pieces: [makePiece('p1')] });
    const artwork = makeArtwork('a1');
    const next = reducer(state, addArtwork({ pieceId: 'p1', artwork }));
    expect(next.pieces[0].artworks).toHaveLength(1);
    expect(next.pieces[0].artworks![0].id).toBe('a1');
    expect(next.isDirty).toBe(true);
  });

  it('addArtwork rejects missing piece', () => {
    const state = baseState({ pieces: [] });
    const artwork = makeArtwork('a1');
    const next = reducer(state, addArtwork({ pieceId: 'no-such-piece', artwork }));
    expect(next.isDirty).toBe(false);
  });

  it('addArtwork initializes artworks array when undefined', () => {
    const piece = makePiece('p1');
    // Ensure no artworks property exists
    delete (piece as any).artworks;
    const state = baseState({ pieces: [piece] });
    const artwork = makeArtwork('a1');
    const next = reducer(state, addArtwork({ pieceId: 'p1', artwork }));
    expect(next.pieces[0].artworks).toHaveLength(1);
  });

  it('addArtwork appends multiple artworks', () => {
    const state = baseState({ pieces: [makePiece('p1')] });
    let next = reducer(state, addArtwork({ pieceId: 'p1', artwork: makeArtwork('a1') }));
    next = reducer(next, addArtwork({ pieceId: 'p1', artwork: makeArtwork('a2') }));
    expect(next.pieces[0].artworks).toHaveLength(2);
  });

  // ─── updateArtwork ──────────────────────────────────────────────────────

  it('updateArtwork updates fields', () => {
    const piece = { ...makePiece('p1'), artworks: [makeArtwork('a1')] };
    const state = baseState({ pieces: [piece] });
    const next = reducer(state, updateArtwork({
      pieceId: 'p1',
      artworkId: 'a1',
      changes: { opacity: 0.5, rotation: 45 },
    }));
    expect(next.pieces[0].artworks![0].opacity).toBe(0.5);
    expect(next.pieces[0].artworks![0].rotation).toBe(45);
    expect(next.pieces[0].artworks![0].filename).toBe('a1.png'); // unchanged
    expect(next.isDirty).toBe(true);
  });

  it('updateArtwork no-op if piece not found', () => {
    const state = baseState({ pieces: [makePiece('p1')] });
    const next = reducer(state, updateArtwork({
      pieceId: 'no-piece',
      artworkId: 'a1',
      changes: { opacity: 0.5 },
    }));
    expect(next.isDirty).toBe(false);
  });

  it('updateArtwork no-op if artwork not found', () => {
    const piece = { ...makePiece('p1'), artworks: [makeArtwork('a1')] };
    const state = baseState({ pieces: [piece] });
    const next = reducer(state, updateArtwork({
      pieceId: 'p1',
      artworkId: 'nonexistent',
      changes: { opacity: 0.5 },
    }));
    expect(next.isDirty).toBe(false);
  });

  it('updateArtwork no-op if piece has no artworks array', () => {
    const state = baseState({ pieces: [makePiece('p1')] });
    const next = reducer(state, updateArtwork({
      pieceId: 'p1',
      artworkId: 'a1',
      changes: { opacity: 0.5 },
    }));
    expect(next.isDirty).toBe(false);
  });

  // ─── removeArtwork ──────────────────────────────────────────────────────

  it('removeArtwork removes by id', () => {
    const piece = { ...makePiece('p1'), artworks: [makeArtwork('a1'), makeArtwork('a2')] };
    const state = baseState({ pieces: [piece] });
    const next = reducer(state, removeArtwork({ pieceId: 'p1', artworkId: 'a1' }));
    expect(next.pieces[0].artworks).toHaveLength(1);
    expect(next.pieces[0].artworks![0].id).toBe('a2');
    expect(next.isDirty).toBe(true);
  });

  it('removeArtwork safe if piece not found', () => {
    const state = baseState({ pieces: [makePiece('p1')] });
    const next = reducer(state, removeArtwork({ pieceId: 'no-piece', artworkId: 'a1' }));
    expect(next.isDirty).toBe(false);
  });

  it('removeArtwork safe if artworks undefined', () => {
    const state = baseState({ pieces: [makePiece('p1')] });
    const next = reducer(state, removeArtwork({ pieceId: 'p1', artworkId: 'a1' }));
    expect(next.isDirty).toBe(false);
  });

  // ─── Serialization ──────────────────────────────────────────────────────

  it('artworks survive JSON round-trip', () => {
    const artwork = makeArtwork('a1', { position: { x: 10, y: 20 }, opacity: 0.8 });
    const piece = { ...makePiece('p1'), artworks: [artwork] };
    const serialized = JSON.parse(JSON.stringify(piece));
    expect(serialized.artworks).toHaveLength(1);
    expect(serialized.artworks[0].id).toBe('a1');
    expect(serialized.artworks[0].position).toEqual({ x: 10, y: 20 });
    expect(serialized.artworks[0].opacity).toBe(0.8);
  });
});
