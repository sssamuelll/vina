/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, {
  addReferenceImage,
  removeReferenceImage,
  updateReferenceImage,
} from '../projectSlice';
import { ReferenceImage } from '../../types/types';

function makeImage(id: string, overrides: Partial<ReferenceImage> = {}): ReferenceImage {
  return {
    id,
    filename: 'sketch.jpg',
    width: 800,
    height: 600,
    position: { x: 0, y: 0 },
    scale: 1.0,
    rotation: 0,
    opacity: 1.0,
    locked: false,
    visible: true,
    pixelsPerMm: null,
    ...overrides,
  };
}

function baseState(overrides: Record<string, any> = {}) {
  return {
    id: 'test', name: 'Test', pieces: [] as any[], seams: [], fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
    avatarMode: 'model' as const, avatarModelUrl: null, isDirty: false,
    arrangementOverrides: {}, groups: [], seamGroups: [], poms: [] as any[],
    referenceImages: [] as ReferenceImage[],
    layerNames: {}, layerLocked: {},
    loadDiagnostics: [],
    loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
    ...overrides,
  };
}

describe('projectSlice — referenceImages', () => {
  it('addReferenceImage appends to array', () => {
    const state = baseState();
    const img = makeImage('img-1');
    const next = reducer(state, addReferenceImage(img));
    expect(next.referenceImages).toHaveLength(1);
    expect(next.referenceImages[0].id).toBe('img-1');
    expect(next.referenceImages[0].filename).toBe('sketch.jpg');
  });

  it('addReferenceImage rejects when count >= 10', () => {
    const images = Array.from({ length: 10 }, (_, i) => makeImage(`img-${i}`));
    const state = baseState({ referenceImages: images });
    const next = reducer(state, addReferenceImage(makeImage('img-overflow')));
    expect(next.referenceImages).toHaveLength(10);
    expect(next.referenceImages.find(i => i.id === 'img-overflow')).toBeUndefined();
  });

  it('removeReferenceImage removes by id', () => {
    const state = baseState({
      referenceImages: [makeImage('img-1'), makeImage('img-2')],
    });
    const next = reducer(state, removeReferenceImage('img-1'));
    expect(next.referenceImages).toHaveLength(1);
    expect(next.referenceImages[0].id).toBe('img-2');
  });

  it('updateReferenceImage merges partial update', () => {
    const state = baseState({
      referenceImages: [makeImage('img-1', { opacity: 0.5, scale: 1.0 })],
    });
    const next = reducer(state, updateReferenceImage({ id: 'img-1', opacity: 0.3, scale: 2.0 }));
    expect(next.referenceImages[0].opacity).toBe(0.3);
    expect(next.referenceImages[0].scale).toBe(2.0);
    // unchanged fields are preserved
    expect(next.referenceImages[0].filename).toBe('sketch.jpg');
  });

  it('addReferenceImage marks isDirty', () => {
    const state = baseState({ isDirty: false });
    const next = reducer(state, addReferenceImage(makeImage('img-1')));
    expect(next.isDirty).toBe(true);
  });

  it('removeReferenceImage marks isDirty', () => {
    const state = baseState({
      referenceImages: [makeImage('img-1')],
      isDirty: false,
    });
    const next = reducer(state, removeReferenceImage('img-1'));
    expect(next.isDirty).toBe(true);
  });

  it('updateReferenceImage marks isDirty', () => {
    const state = baseState({
      referenceImages: [makeImage('img-1')],
      isDirty: false,
    });
    const next = reducer(state, updateReferenceImage({ id: 'img-1', opacity: 0.8 }));
    expect(next.isDirty).toBe(true);
  });

  it('updateReferenceImage is no-op for unknown id', () => {
    const state = baseState({
      referenceImages: [makeImage('img-1')],
      isDirty: false,
    });
    const next = reducer(state, updateReferenceImage({ id: 'img-unknown', opacity: 0.1 }));
    expect(next.referenceImages).toHaveLength(1);
    expect(next.isDirty).toBe(false);
  });

  it('addReferenceImage allows up to 9 images (below limit)', () => {
    const images = Array.from({ length: 9 }, (_, i) => makeImage(`img-${i}`));
    const state = baseState({ referenceImages: images });
    const next = reducer(state, addReferenceImage(makeImage('img-9')));
    expect(next.referenceImages).toHaveLength(10);
    expect(next.referenceImages[9].id).toBe('img-9');
  });
});
