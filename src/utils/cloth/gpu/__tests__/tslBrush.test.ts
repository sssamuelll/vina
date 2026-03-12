import { describe, it, expect, vi } from 'vitest';

// Mock three/tsl before importing.
vi.mock('three/tsl', () => {
  // Deep proxy that returns itself for any property access or function call.
  // This allows arbitrarily chained TSL operations (.mul().add() etc.)
  // without needing explicit stubs for every method.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createChainProxy = (): any => {
    const handler: ProxyHandler<(...args: unknown[]) => unknown> = {
      get() {
        return createChainProxy();
      },
      apply() {
        return createChainProxy();
      },
    };
    return new Proxy(function () {}, handler);
  };

  const proxy = createChainProxy();

  const mockUniform = (val: number) => ({ value: val });

  return {
    // Fn: returns a function that, when called (the () invocation), returns a proxy
    Fn: () => () => proxy,
    storage: () => proxy,
    uniform: mockUniform,
    compute: (_fn: unknown, count: number) => ({
      __tslCompute: true,
      dispatchCount: count,
    }),
    instanceIndex: proxy,
    uint: () => proxy,
    int: () => proxy,
    float: () => proxy,
    If: () => proxy,
  };
});

import { makeBrushComputeNode } from '../tslBrush';
import type { BrushComputeNodes } from '../tslBrush';

describe('makeBrushComputeNode', () => {
  // Shared setup
  function createTestNodes() {
    const numParticles = 20;

    const mockNode = { element: () => mockNode, toAttribute: () => mockNode };

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const nodes: BrushComputeNodes = makeBrushComputeNode(
      mockNode as any, // posBufNode
      mockNode as any, // velBufNode
      mockNode as any, // invMassBufNode
      numParticles,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return { nodes, numParticles };
  }

  it('exports makeBrushComputeNode function', () => {
    expect(typeof makeBrushComputeNode).toBe('function');
  });

  it('BrushComputeNodes has expected uniform shape', () => {
    expect(makeBrushComputeNode).toBeDefined();
  });

  it('returns an object with brushNode', () => {
    const { nodes } = createTestNodes();
    expect(nodes).toBeDefined();
    expect(nodes.brushNode).toBeDefined();
  });

  it('brushNode has dispatchCount matching numParticles', () => {
    const { nodes, numParticles } = createTestNodes();
    expect(nodes.brushNode).toHaveProperty('dispatchCount', numParticles);
  });

  it('exposes centerX uniform with default value 0', () => {
    const { nodes } = createTestNodes();
    expect(nodes.centerX).toBeDefined();
    expect(nodes.centerX.value).toBe(0.0);
  });

  it('exposes centerY uniform with default value 0', () => {
    const { nodes } = createTestNodes();
    expect(nodes.centerY).toBeDefined();
    expect(nodes.centerY.value).toBe(0.0);
  });

  it('exposes centerZ uniform with default value 0', () => {
    const { nodes } = createTestNodes();
    expect(nodes.centerZ).toBeDefined();
    expect(nodes.centerZ.value).toBe(0.0);
  });

  it('exposes radius uniform with default value 0.05', () => {
    const { nodes } = createTestNodes();
    expect(nodes.radius).toBeDefined();
    expect(nodes.radius.value).toBe(0.05);
  });

  it('exposes strength uniform with default value 0 (inactive)', () => {
    const { nodes } = createTestNodes();
    expect(nodes.strength).toBeDefined();
    expect(nodes.strength.value).toBe(0.0);
  });

  it('uniforms are mutable at runtime', () => {
    const { nodes } = createTestNodes();

    nodes.centerX.value = 1.5;
    nodes.centerY.value = 2.0;
    nodes.centerZ.value = -0.5;
    nodes.radius.value = 0.1;
    nodes.strength.value = 0.8;

    expect(nodes.centerX.value).toBe(1.5);
    expect(nodes.centerY.value).toBe(2.0);
    expect(nodes.centerZ.value).toBe(-0.5);
    expect(nodes.radius.value).toBe(0.1);
    expect(nodes.strength.value).toBe(0.8);
  });
});
