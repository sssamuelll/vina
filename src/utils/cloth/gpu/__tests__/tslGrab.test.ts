import { describe, it, expect, vi } from 'vitest';

// Mock three/tsl before importing.
vi.mock('three/tsl', () => {
  // Deep proxy that returns itself for any property access or function call.
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
    mix: () => proxy,
  };
});

import { makeGrabComputeNode } from '../tslGrab';
import type { GrabComputeNodes } from '../tslGrab';

describe('makeGrabComputeNode', () => {
  function createTestNodes() {
    const numParticles = 20;

    const mockNode = { element: () => mockNode, toAttribute: () => mockNode };

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const nodes: GrabComputeNodes = makeGrabComputeNode(
      mockNode as any, // posBufNode
      mockNode as any, // invMassBufNode
      mockNode as any, // grabMaskBufNode
      mockNode as any, // grabOffsetBufNode
      numParticles,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return { nodes, numParticles };
  }

  it('exports makeGrabComputeNode function', () => {
    expect(typeof makeGrabComputeNode).toBe('function');
  });

  it('returns grabNode and grabInitNode', () => {
    const { nodes } = createTestNodes();
    expect(nodes.grabNode).toBeDefined();
    expect(nodes.grabInitNode).toBeDefined();
  });

  it('grabNode has dispatchCount matching numParticles', () => {
    const { nodes, numParticles } = createTestNodes();
    expect(nodes.grabNode).toHaveProperty('dispatchCount', numParticles);
  });

  it('grabInitNode has dispatchCount matching numParticles', () => {
    const { nodes, numParticles } = createTestNodes();
    expect(nodes.grabInitNode).toHaveProperty('dispatchCount', numParticles);
  });

  it('exposes grabCenter uniforms with default value 0', () => {
    const { nodes } = createTestNodes();
    expect(nodes.grabCenterX.value).toBe(0.0);
    expect(nodes.grabCenterY.value).toBe(0.0);
    expect(nodes.grabCenterZ.value).toBe(0.0);
  });

  it('exposes grabActive uniform with default value 0 (inactive)', () => {
    const { nodes } = createTestNodes();
    expect(nodes.grabActive.value).toBe(0.0);
  });

  it('exposes grabInitPending uniform with default value 0', () => {
    const { nodes } = createTestNodes();
    expect(nodes.grabInitPending.value).toBe(0.0);
  });

  it('exposes grabRadius uniform with default value 0.05', () => {
    const { nodes } = createTestNodes();
    expect(nodes.grabRadius.value).toBe(0.05);
  });

  it('exposes grabStrength uniform with default value 0.8', () => {
    const { nodes } = createTestNodes();
    expect(nodes.grabStrength.value).toBe(0.8);
  });

  it('uniforms are mutable at runtime', () => {
    const { nodes } = createTestNodes();

    nodes.grabCenterX.value = 1.5;
    nodes.grabCenterY.value = 2.0;
    nodes.grabCenterZ.value = -0.5;
    nodes.grabActive.value = 1;
    nodes.grabInitPending.value = 1;
    nodes.grabRadius.value = 0.1;
    nodes.grabStrength.value = 0.5;

    expect(nodes.grabCenterX.value).toBe(1.5);
    expect(nodes.grabCenterY.value).toBe(2.0);
    expect(nodes.grabCenterZ.value).toBe(-0.5);
    expect(nodes.grabActive.value).toBe(1);
    expect(nodes.grabInitPending.value).toBe(1);
    expect(nodes.grabRadius.value).toBe(0.1);
    expect(nodes.grabStrength.value).toBe(0.5);
  });
});
