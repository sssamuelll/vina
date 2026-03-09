import { describe, it, expect } from 'vitest';
import avatarReducer, {
  setAvailableMorphTargets,
  setMorphTarget,
  clearMorphTargets,
} from '../avatarSlice';
import type { AvatarState } from '../avatarSlice';

// Minimal initial state for testing morph target actions
function makeState(overrides: Partial<AvatarState> = {}): AvatarState {
  return {
    pose: {
      joints: {},
      activePreset: null,
      ikChains: [],
      ikTargets: [],
      ikEnabled: false,
    },
    poseEditorOpen: false,
    selectedJoint: null,
    savedPoses: [],
    avatarProfiles: [],
    activeProfileId: null,
    morphTargets: {},
    availableMorphTargets: [],
    ...overrides,
  };
}

describe('Morph Target State', () => {
  it('setAvailableMorphTargets populates the list', () => {
    const state = makeState();
    const next = avatarReducer(state, setAvailableMorphTargets(['muscular', 'slim']));
    expect(next.availableMorphTargets).toEqual(['muscular', 'slim']);
  });

  it('setAvailableMorphTargets resets morph values to 0', () => {
    const state = makeState({ morphTargets: { old: 0.5 } });
    const next = avatarReducer(state, setAvailableMorphTargets(['muscular']));
    expect(next.morphTargets).toEqual({ muscular: 0 });
  });

  it('setMorphTarget updates a single morph value', () => {
    const state = makeState({
      availableMorphTargets: ['muscular'],
      morphTargets: { muscular: 0 },
    });
    const next = avatarReducer(state, setMorphTarget({ name: 'muscular', value: 0.7 }));
    expect(next.morphTargets.muscular).toBe(0.7);
  });

  it('setMorphTarget clamps value to 0-1', () => {
    const state = makeState({
      availableMorphTargets: ['slim'],
      morphTargets: { slim: 0 },
    });
    let next = avatarReducer(state, setMorphTarget({ name: 'slim', value: 1.5 }));
    expect(next.morphTargets.slim).toBe(1);
    next = avatarReducer(state, setMorphTarget({ name: 'slim', value: -0.3 }));
    expect(next.morphTargets.slim).toBe(0);
  });

  it('setMorphTarget ignores unknown morph names', () => {
    const state = makeState({
      availableMorphTargets: ['muscular'],
      morphTargets: { muscular: 0 },
    });
    const next = avatarReducer(state, setMorphTarget({ name: 'unknown', value: 0.5 }));
    expect(next.morphTargets).toEqual({ muscular: 0 });
  });

  it('clearMorphTargets resets both fields', () => {
    const state = makeState({
      availableMorphTargets: ['muscular', 'slim'],
      morphTargets: { muscular: 0.5, slim: 0.3 },
    });
    const next = avatarReducer(state, clearMorphTargets());
    expect(next.availableMorphTargets).toEqual([]);
    expect(next.morphTargets).toEqual({});
  });
});
