import { describe, it, expect } from 'vitest';
import collisionBodyReducer, {
  addCollisionBody,
  removeCollisionBody,
  updateCollisionBodyTransform,
  updateCollisionBodyCollision,
  setCollisionBodyName,
  setCollisionBodyVisibility,
  selectCollisionBody,
  setAnimationState,
  type CollisionBodyState,
} from '../collisionBodySlice';
import type { CollisionBody } from '../../types/collisionBody';

function getInitialState(): CollisionBodyState {
  return collisionBodyReducer(undefined, { type: '@@INIT' });
}

function makeBody(overrides: Partial<CollisionBody> = {}): CollisionBody {
  return {
    id: 'body-1',
    name: 'Test Body',
    meshUrl: '/meshes/table.glb',
    format: 'glb',
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    collision: {
      enabled: true,
      friction: 0.3,
      offset: 0.005,
    },
    animation: {
      clipIndex: null,
      playing: false,
      time: 0,
      loop: false,
    },
    visible: true,
    ...overrides,
  };
}

describe('collisionBodySlice', () => {
  it('initializes with empty bodies and no selection', () => {
    const state = getInitialState();
    expect(state.bodies).toEqual([]);
    expect(state.selectedBodyId).toBeNull();
  });

  describe('addCollisionBody', () => {
    it('adds a collision body to the list', () => {
      const body = makeBody();
      const state = collisionBodyReducer(getInitialState(), addCollisionBody(body));
      expect(state.bodies).toHaveLength(1);
      expect(state.bodies[0]).toEqual(body);
    });

    it('adds multiple bodies', () => {
      let state = getInitialState();
      state = collisionBodyReducer(state, addCollisionBody(makeBody({ id: 'a' })));
      state = collisionBodyReducer(state, addCollisionBody(makeBody({ id: 'b' })));
      expect(state.bodies).toHaveLength(2);
    });
  });

  describe('removeCollisionBody', () => {
    it('removes a body by id', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody({ id: 'a' })));
      state = collisionBodyReducer(state, addCollisionBody(makeBody({ id: 'b' })));
      state = collisionBodyReducer(state, removeCollisionBody('a'));
      expect(state.bodies).toHaveLength(1);
      expect(state.bodies[0].id).toBe('b');
    });

    it('clears selection if the removed body was selected', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody({ id: 'a' })));
      state = collisionBodyReducer(state, selectCollisionBody('a'));
      expect(state.selectedBodyId).toBe('a');
      state = collisionBodyReducer(state, removeCollisionBody('a'));
      expect(state.selectedBodyId).toBeNull();
    });

    it('preserves selection if a different body is removed', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody({ id: 'a' })));
      state = collisionBodyReducer(state, addCollisionBody(makeBody({ id: 'b' })));
      state = collisionBodyReducer(state, selectCollisionBody('a'));
      state = collisionBodyReducer(state, removeCollisionBody('b'));
      expect(state.selectedBodyId).toBe('a');
    });

    it('does nothing if id does not exist', () => {
      const state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody({ id: 'a' })));
      const next = collisionBodyReducer(state, removeCollisionBody('nonexistent'));
      expect(next.bodies).toHaveLength(1);
    });
  });

  describe('updateCollisionBodyTransform', () => {
    it('updates position only (partial merge)', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      state = collisionBodyReducer(
        state,
        updateCollisionBodyTransform({ id: 'body-1', transform: { position: [1, 2, 3] } })
      );
      expect(state.bodies[0].transform.position).toEqual([1, 2, 3]);
      expect(state.bodies[0].transform.rotation).toEqual([0, 0, 0]);
      expect(state.bodies[0].transform.scale).toEqual([1, 1, 1]);
    });

    it('updates rotation and scale together', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      state = collisionBodyReducer(
        state,
        updateCollisionBodyTransform({
          id: 'body-1',
          transform: { rotation: [45, 90, 0], scale: [2, 2, 2] },
        })
      );
      expect(state.bodies[0].transform.rotation).toEqual([45, 90, 0]);
      expect(state.bodies[0].transform.scale).toEqual([2, 2, 2]);
    });

    it('does nothing for unknown id', () => {
      const state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      const next = collisionBodyReducer(
        state,
        updateCollisionBodyTransform({ id: 'unknown', transform: { position: [9, 9, 9] } })
      );
      expect(next.bodies[0].transform.position).toEqual([0, 0, 0]);
    });
  });

  describe('updateCollisionBodyCollision', () => {
    it('partially merges collision properties', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      state = collisionBodyReducer(
        state,
        updateCollisionBodyCollision({ id: 'body-1', collision: { friction: 0.8 } })
      );
      expect(state.bodies[0].collision.friction).toBe(0.8);
      expect(state.bodies[0].collision.enabled).toBe(true);
      expect(state.bodies[0].collision.offset).toBe(0.005);
    });

    it('can disable collision', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      state = collisionBodyReducer(
        state,
        updateCollisionBodyCollision({ id: 'body-1', collision: { enabled: false } })
      );
      expect(state.bodies[0].collision.enabled).toBe(false);
    });

    it('does nothing for unknown id', () => {
      const state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      const next = collisionBodyReducer(
        state,
        updateCollisionBodyCollision({ id: 'unknown', collision: { friction: 0.9 } })
      );
      expect(next.bodies[0].collision.friction).toBe(0.3);
    });
  });

  describe('setCollisionBodyName', () => {
    it('renames a body', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      state = collisionBodyReducer(
        state,
        setCollisionBodyName({ id: 'body-1', name: 'Mannequin' })
      );
      expect(state.bodies[0].name).toBe('Mannequin');
    });

    it('does nothing for unknown id', () => {
      const state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      const next = collisionBodyReducer(
        state,
        setCollisionBodyName({ id: 'unknown', name: 'Nope' })
      );
      expect(next.bodies[0].name).toBe('Test Body');
    });
  });

  describe('setCollisionBodyVisibility', () => {
    it('hides a body', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      state = collisionBodyReducer(
        state,
        setCollisionBodyVisibility({ id: 'body-1', visible: false })
      );
      expect(state.bodies[0].visible).toBe(false);
    });

    it('shows a hidden body', () => {
      let state = collisionBodyReducer(
        getInitialState(),
        addCollisionBody(makeBody({ visible: false }))
      );
      state = collisionBodyReducer(
        state,
        setCollisionBodyVisibility({ id: 'body-1', visible: true })
      );
      expect(state.bodies[0].visible).toBe(true);
    });

    it('does nothing for unknown id', () => {
      const state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      const next = collisionBodyReducer(
        state,
        setCollisionBodyVisibility({ id: 'unknown', visible: false })
      );
      expect(next.bodies[0].visible).toBe(true);
    });
  });

  describe('selectCollisionBody', () => {
    it('selects a body by id', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      state = collisionBodyReducer(state, selectCollisionBody('body-1'));
      expect(state.selectedBodyId).toBe('body-1');
    });

    it('clears selection with null', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      state = collisionBodyReducer(state, selectCollisionBody('body-1'));
      state = collisionBodyReducer(state, selectCollisionBody(null));
      expect(state.selectedBodyId).toBeNull();
    });

    it('switches selection to a different body', () => {
      let state = getInitialState();
      state = collisionBodyReducer(state, addCollisionBody(makeBody({ id: 'a' })));
      state = collisionBodyReducer(state, addCollisionBody(makeBody({ id: 'b' })));
      state = collisionBodyReducer(state, selectCollisionBody('a'));
      state = collisionBodyReducer(state, selectCollisionBody('b'));
      expect(state.selectedBodyId).toBe('b');
    });
  });

  describe('setAnimationState', () => {
    it('updates animation playing state', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      state = collisionBodyReducer(
        state,
        setAnimationState({ id: 'body-1', animation: { playing: true } })
      );
      expect(state.bodies[0].animation.playing).toBe(true);
      expect(state.bodies[0].animation.clipIndex).toBeNull();
      expect(state.bodies[0].animation.time).toBe(0);
      expect(state.bodies[0].animation.loop).toBe(false);
    });

    it('sets clip index and loop together', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      state = collisionBodyReducer(
        state,
        setAnimationState({ id: 'body-1', animation: { clipIndex: 2, loop: true } })
      );
      expect(state.bodies[0].animation.clipIndex).toBe(2);
      expect(state.bodies[0].animation.loop).toBe(true);
    });

    it('updates time', () => {
      let state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      state = collisionBodyReducer(
        state,
        setAnimationState({ id: 'body-1', animation: { time: 1.5 } })
      );
      expect(state.bodies[0].animation.time).toBe(1.5);
    });

    it('does nothing for unknown id', () => {
      const state = collisionBodyReducer(getInitialState(), addCollisionBody(makeBody()));
      const next = collisionBodyReducer(
        state,
        setAnimationState({ id: 'unknown', animation: { playing: true } })
      );
      expect(next.bodies[0].animation.playing).toBe(false);
    });
  });
});
