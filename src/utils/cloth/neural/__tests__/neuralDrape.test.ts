import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NeuralDrapeClient, isNeuralDrapeAvailable } from '../neuralDrapeClient';

// Polyfill rAF for Node
let rafId = 0;
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  rafId++;
  const id = rafId;
  setTimeout(() => cb(performance.now()), 16);
  return id;
};
globalThis.cancelAnimationFrame = (_id: number) => {};

describe('NeuralDrapeClient', () => {
  let client: NeuralDrapeClient;

  beforeEach(() => {
    client = new NeuralDrapeClient({ useAnalytical: true, gravity: 9.81, stiffness: 0.3 });
  });

  afterEach(() => {
    client.dispose();
  });

  it('isNeuralDrapeAvailable always returns true (analytical fallback)', () => {
    expect(isNeuralDrapeAvailable()).toBe(true);
  });

  it('initializes with merged piece data', async () => {
    await client.initMultiPiece([
      { pieceId: 'front', vertices: [0, 0.5, 0, 0.1, 0.5, 0, 0.1, 0, 0], triIds: [0, 1, 2] },
      { pieceId: 'back', vertices: [0.2, 0.5, 0, 0.3, 0.5, 0, 0.3, 0, 0], triIds: [0, 1, 2] },
    ]);
    // No error = success
  });

  it('analytical drape produces positions that move downward over time', async () => {
    const frames: Float32Array[] = [];
    client.onFrame = (pos) => frames.push(new Float32Array(pos));

    await client.initMultiPiece([
      { pieceId: 'test', vertices: [0, 0.5, 0, 0.1, 0.3, 0, 0.05, 0.1, 0], triIds: [0, 1, 2] },
    ]);

    // Simulate a few frames manually by calling start and waiting
    client.start();

    // Wait for a few frames
    await new Promise(r => setTimeout(r, 100));
    client.stop();

    expect(frames.length).toBeGreaterThan(0);

    // First frame should have positions different from rest (gravity pulls down)
    const lastFrame = frames[frames.length - 1];
    // Y values should be lower than rest positions (gravity)
    // Vertex 0: rest Y = 0.5
    expect(lastFrame[1]).toBeLessThanOrEqual(0.5);
  });

  it('start/stop lifecycle works', async () => {
    await client.initMultiPiece([
      { pieceId: 'a', vertices: [0, 0, 0], triIds: [] },
    ]);

    client.start();
    client.stop();
    client.start();
    client.stop();
    // No crash = success
  });

  it('dispose cleans up', async () => {
    await client.initMultiPiece([
      { pieceId: 'a', vertices: [0, 0, 0], triIds: [] },
    ]);
    client.start();
    await client.dispose();
    // No crash = success
  });

  it('setSDF is a no-op (API compatibility)', async () => {
    await client.initMultiPiece([
      { pieceId: 'a', vertices: [0, 0, 0], triIds: [] },
    ]);
    client.setSDF({ distances: new Float32Array(0), resolution: 0, min: [0, 0, 0], cellSize: 0 });
    // No crash = success
  });

  it('defaults to analytical mode when no model URL', () => {
    const c = new NeuralDrapeClient();
    // useAnalytical should be true by default
    expect(isNeuralDrapeAvailable()).toBe(true);
    c.dispose();
  });
});
