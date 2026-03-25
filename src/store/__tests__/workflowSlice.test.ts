import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage before importing the slice (it reads storage at module load time
// in other slices; workflowSlice does not pre-load at initialState but tests
// for persistWorkflow / loadWorkflow still need a mock in scope).
const mockStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
});

import workflowReducer, {
  setExpertMode,
  setConfirmOverride,
  updateToolMemory,
  clearToolMemory,
  rehydrateWorkflow,
  persistWorkflow,
  loadWorkflow,
  type WorkflowState,
} from '../workflowSlice';
import { NEW_PROJECT } from '../actions';

function getInitialState(): WorkflowState {
  return workflowReducer(undefined, { type: '@@INIT' });
}

describe('workflowSlice', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('has correct initial state', () => {
    const state = getInitialState();
    expect(state.expertMode).toBe(false);
    expect(state.confirmOverrides).toEqual({});
    expect(state.toolMemory).toEqual({});
  });

  // -------------------------------------------------------------------------
  // setExpertMode
  // -------------------------------------------------------------------------

  describe('setExpertMode', () => {
    it('turns expert mode on', () => {
      const state = workflowReducer(getInitialState(), setExpertMode(true));
      expect(state.expertMode).toBe(true);
    });

    it('turns expert mode off', () => {
      let state = workflowReducer(getInitialState(), setExpertMode(true));
      state = workflowReducer(state, setExpertMode(false));
      expect(state.expertMode).toBe(false);
    });

    it('is idempotent when already in the target state', () => {
      const state = workflowReducer(getInitialState(), setExpertMode(false));
      expect(state.expertMode).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // setConfirmOverride
  // -------------------------------------------------------------------------

  describe('setConfirmOverride', () => {
    it('sets an override for an operation', () => {
      const state = workflowReducer(
        getInitialState(),
        setConfirmOverride({ operation: 'deletePattern', value: 'never' })
      );
      expect(state.confirmOverrides['deletePattern']).toBe('never');
    });

    it('updates an existing override', () => {
      let state = workflowReducer(
        getInitialState(),
        setConfirmOverride({ operation: 'deletePattern', value: 'never' })
      );
      state = workflowReducer(
        state,
        setConfirmOverride({ operation: 'deletePattern', value: 'always' })
      );
      expect(state.confirmOverrides['deletePattern']).toBe('always');
    });

    it('stores multiple overrides independently', () => {
      let state = workflowReducer(
        getInitialState(),
        setConfirmOverride({ operation: 'deletePattern', value: 'never' })
      );
      state = workflowReducer(
        state,
        setConfirmOverride({ operation: 'applyTemplate', value: 'always' })
      );
      expect(state.confirmOverrides['deletePattern']).toBe('never');
      expect(state.confirmOverrides['applyTemplate']).toBe('always');
    });

    it('accepts all three valid values', () => {
      const values: Array<'default' | 'always' | 'never'> = ['default', 'always', 'never'];
      for (const value of values) {
        const state = workflowReducer(
          getInitialState(),
          setConfirmOverride({ operation: 'op', value })
        );
        expect(state.confirmOverrides['op']).toBe(value);
      }
    });
  });

  // -------------------------------------------------------------------------
  // updateToolMemory
  // -------------------------------------------------------------------------

  describe('updateToolMemory', () => {
    it('stores values for a tool', () => {
      const state = workflowReducer(
        getInitialState(),
        updateToolMemory({ tool: 'seam', values: { width: 1.5, style: 'plain' } })
      );
      expect(state.toolMemory['seam']).toEqual({ width: 1.5, style: 'plain' });
    });

    it('merges new values with existing ones', () => {
      let state = workflowReducer(
        getInitialState(),
        updateToolMemory({ tool: 'seam', values: { width: 1.5 } })
      );
      state = workflowReducer(
        state,
        updateToolMemory({ tool: 'seam', values: { style: 'french' } })
      );
      expect(state.toolMemory['seam']).toEqual({ width: 1.5, style: 'french' });
    });

    it('overwrites a specific key on merge', () => {
      let state = workflowReducer(
        getInitialState(),
        updateToolMemory({ tool: 'seam', values: { width: 1.5, style: 'plain' } })
      );
      state = workflowReducer(
        state,
        updateToolMemory({ tool: 'seam', values: { width: 2.0 } })
      );
      expect(state.toolMemory['seam']['width']).toBe(2.0);
      expect(state.toolMemory['seam']['style']).toBe('plain');
    });

    it('stores memories for different tools independently', () => {
      let state = workflowReducer(
        getInitialState(),
        updateToolMemory({ tool: 'seam', values: { width: 1.5 } })
      );
      state = workflowReducer(
        state,
        updateToolMemory({ tool: 'hem', values: { depth: 3.0 } })
      );
      expect(state.toolMemory['seam']).toEqual({ width: 1.5 });
      expect(state.toolMemory['hem']).toEqual({ depth: 3.0 });
    });
  });

  // -------------------------------------------------------------------------
  // clearToolMemory
  // -------------------------------------------------------------------------

  describe('clearToolMemory', () => {
    it('clears all tool memory', () => {
      let state = workflowReducer(
        getInitialState(),
        updateToolMemory({ tool: 'seam', values: { width: 1.5 } })
      );
      state = workflowReducer(
        state,
        updateToolMemory({ tool: 'hem', values: { depth: 3.0 } })
      );
      state = workflowReducer(state, clearToolMemory());
      expect(state.toolMemory).toEqual({});
    });

    it('is safe to call on already-empty toolMemory', () => {
      const state = workflowReducer(getInitialState(), clearToolMemory());
      expect(state.toolMemory).toEqual({});
    });

    it('does not affect expertMode or confirmOverrides', () => {
      let state = workflowReducer(getInitialState(), setExpertMode(true));
      state = workflowReducer(
        state,
        setConfirmOverride({ operation: 'op', value: 'never' })
      );
      state = workflowReducer(
        state,
        updateToolMemory({ tool: 'seam', values: { width: 1.5 } })
      );
      state = workflowReducer(state, clearToolMemory());
      expect(state.expertMode).toBe(true);
      expect(state.confirmOverrides['op']).toBe('never');
      expect(state.toolMemory).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // rehydrateWorkflow
  // -------------------------------------------------------------------------

  describe('rehydrateWorkflow', () => {
    it('restores full state from a saved snapshot', () => {
      const saved: WorkflowState = {
        expertMode: true,
        confirmOverrides: { deletePattern: 'never' },
        toolMemory: { seam: { width: 2.0 } },
        dxfPreferredFormat: null,
      };
      const state = workflowReducer(getInitialState(), rehydrateWorkflow(saved));
      expect(state.expertMode).toBe(true);
      expect(state.confirmOverrides).toEqual({ deletePattern: 'never' });
      expect(state.toolMemory).toEqual({ seam: { width: 2.0 } });
    });

    it('overwrites existing state fully', () => {
      let state = workflowReducer(getInitialState(), setExpertMode(true));
      state = workflowReducer(
        state,
        setConfirmOverride({ operation: 'op', value: 'always' })
      );
      const restored: WorkflowState = {
        expertMode: false,
        confirmOverrides: {},
        toolMemory: {},
        dxfPreferredFormat: null,
      };
      state = workflowReducer(state, rehydrateWorkflow(restored));
      expect(state.expertMode).toBe(false);
      expect(state.confirmOverrides).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // persistWorkflow
  // -------------------------------------------------------------------------

  describe('persistWorkflow', () => {
    it('writes a versioned envelope to localStorage', () => {
      const wf: WorkflowState = {
        expertMode: true,
        confirmOverrides: { op: 'never' },
        toolMemory: { seam: { width: 1.5 } },
        dxfPreferredFormat: null,
      };
      persistWorkflow(wf);
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'openclo-workflow',
        expect.any(String)
      );
      const stored = JSON.parse(mockStorage['openclo-workflow']);
      expect(stored.version).toBe(1);
      expect(stored.data).toEqual(wf);
    });

    it('does not throw when localStorage is unavailable', () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          throw new Error('storage unavailable');
        }),
        removeItem: vi.fn(),
      });
      expect(() => persistWorkflow(getInitialState())).not.toThrow();
      // Restore mock
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // loadWorkflow
  // -------------------------------------------------------------------------

  describe('loadWorkflow', () => {
    it('returns null when localStorage has no entry', () => {
      expect(loadWorkflow()).toBeNull();
    });

    it('returns the saved state when the envelope is valid', () => {
      const wf: WorkflowState = {
        expertMode: true,
        confirmOverrides: { op: 'always' },
        toolMemory: { hem: { depth: 3.0 } },
        dxfPreferredFormat: null,
      };
      persistWorkflow(wf);
      const loaded = loadWorkflow();
      expect(loaded).toEqual(wf);
    });

    it('returns null for corrupt JSON', () => {
      mockStorage['openclo-workflow'] = 'not-valid-json{{{';
      expect(loadWorkflow()).toBeNull();
    });

    it('returns null when version does not match', () => {
      mockStorage['openclo-workflow'] = JSON.stringify({
        version: 99,
        data: { expertMode: false, confirmOverrides: {}, toolMemory: {} },
      });
      expect(loadWorkflow()).toBeNull();
    });

    it('returns null when data field is missing', () => {
      mockStorage['openclo-workflow'] = JSON.stringify({ version: 1 });
      expect(loadWorkflow()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // NEW_PROJECT action
  // -------------------------------------------------------------------------

  describe('NEW_PROJECT', () => {
    it('clears toolMemory on new project', () => {
      let state = workflowReducer(
        getInitialState(),
        updateToolMemory({ tool: 'seam', values: { width: 1.5 } })
      );
      state = workflowReducer(state, NEW_PROJECT());
      expect(state.toolMemory).toEqual({});
    });

    it('preserves expertMode on new project', () => {
      let state = workflowReducer(getInitialState(), setExpertMode(true));
      state = workflowReducer(state, NEW_PROJECT());
      expect(state.expertMode).toBe(true);
    });

    it('preserves confirmOverrides on new project', () => {
      let state = workflowReducer(
        getInitialState(),
        setConfirmOverride({ operation: 'deletePattern', value: 'never' })
      );
      state = workflowReducer(state, NEW_PROJECT());
      expect(state.confirmOverrides['deletePattern']).toBe('never');
    });
  });
});
