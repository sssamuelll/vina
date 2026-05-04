import { describe, it, expect } from 'vitest';

import {
  CPU_CAPABILITIES,
  WASM_CAPABILITIES,
  GPU_CAPABILITIES,
  NEURAL_CAPABILITIES,
} from '../solverCapabilities';

// Pin the full capability matrix per tier so any silent flag flip lights this
// up loud. Most flips here are intentional decisions (e.g. flipping
// `bodyCollision: false → true` once a tier validates against a baseline
// scenario), so this test is the forcing function: a flip without an updated
// pin = test failure, which forces the author to confirm the criterion
// was actually verified.
//
// `frameDriven` is intentionally absent on CPU/WASM literals (the field is
// optional on the type), so the pin matches the literal as-written.

describe('SolverCapabilities frozen shape', () => {
  it('CPU pin', () => {
    expect(CPU_CAPABILITIES).toEqual({
      selfCollision: true,
      bodyCollision: true,
      lra: true,
      pressure: true,
      fold: true,
      pieceStiffness: true,
      tools: { steamBrush: false, meshGrab: false },
    });
  });

  it('WASM pin', () => {
    expect(WASM_CAPABILITIES).toEqual({
      selfCollision: true,
      bodyCollision: true,
      lra: false,
      pressure: false,
      fold: false,
      pieceStiffness: false,
      tools: { steamBrush: false, meshGrab: true },
    });
  });

  it('GPU pin — bodyCollision stays false until drape verifies against baseline', () => {
    expect(GPU_CAPABILITIES).toEqual({
      selfCollision: false,
      bodyCollision: false,
      lra: false,
      pressure: false,
      fold: false,
      pieceStiffness: false,
      frameDriven: true,
      tools: { steamBrush: true, meshGrab: true },
    });
  });

  it('Neural pin', () => {
    expect(NEURAL_CAPABILITIES).toEqual({
      selfCollision: false,
      bodyCollision: false,
      lra: false,
      pressure: false,
      fold: false,
      pieceStiffness: false,
      frameDriven: false,
      tools: { steamBrush: false, meshGrab: false },
    });
  });

  it('all four matrices are frozen (Object.freeze)', () => {
    expect(Object.isFrozen(CPU_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(WASM_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(GPU_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(NEURAL_CAPABILITIES)).toBe(true);
  });
});
